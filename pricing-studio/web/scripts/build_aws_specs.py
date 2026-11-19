"""Build a source-specification snapshot from the AWS public documentation tables."""

import argparse
import gzip
import hashlib
from html import unescape
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen

SOURCES = {
    'general': 'https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html',
    'compute': 'https://docs.aws.amazon.com/ec2/latest/instancetypes/co.html',
    'memory': 'https://docs.aws.amazon.com/ec2/latest/instancetypes/mo.html',
    'previous': 'https://docs.aws.amazon.com/ec2/latest/instancetypes/pg.html',
    't2': 'https://aws.amazon.com/ec2/instance-types/t2/',
    'rds': 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Summary.html',
    'cache': 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/CacheNodes.SupportedTypes.html',
    'cache_arch': 'https://aws.amazon.com/about-aws/whats-new/2020/10/amazon-elasticache-now-supports-m6g-and-r6g-graviton2-based-instances/',
    'cache_params': 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/ParameterGroups.Engine.html',
    'cache_reserve': 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/redis-memory-management.html',
    'search': 'https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-instance-types.html',
    'search_dimensions': 'https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/es/USD/current/es-ondemand.json',
}
SIZE = r'[a-z][a-z\d]*\.(?:[\d]*xlarge|metal(?:-\d+xl)?|large|medium|small|micro|nano)'


class Tables(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.tables = []
        self.cell = None
        self.table = None
        self.row = None
        self.feed(markup)

    def handle_starttag(self, tag, _):
        if tag == 'table':
            self.table = []
        elif tag == 'tr' and self.table is not None:
            self.row = []
        elif tag in {'td', 'th'} and self.row is not None:
            self.cell = []
        elif tag in {'p', 'br'} and self.cell is not None:
            self.cell.append(' ')

    def handle_data(self, value):
        if self.cell is not None:
            self.cell.append(value)

    def handle_endtag(self, tag):
        if tag in {'td', 'th'} and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def number(text):
    text = text.replace(',', '')
    return float(text) if re.fullmatch(r'\d+(?:\.\d+)?', text) else None


def shape_rows(tables, prefix):
    for table in tables:
        if not table:
            continue
        header = [c.lower() for c in table[0]]
        cpu = next((i for i, c in enumerate(header) if c in {'vcpu', 'vcpus'}), None)
        if 'memory (gib)' not in header:
            continue
        memory = header.index('memory (gib)')
        for row in table[1:]:
            sku = re.sub(r'(?:\*+|\s+\d+(?:[ ,]+\d+)*)$', '', (row[0] if row else '').lower())
            variants = r'(?:\.tpc[12]\.mem\d+x)?' if prefix == r'db\.' else ''
            if len(row) > max(memory, cpu or 0) and re.fullmatch(prefix + SIZE + variants, sku):
                yield sku, number(row[cpu]) if cpu is not None else None, number(row[memory])


def build(pages):
    tables = {name: Tables(body.decode('utf-8')).tables for name, body in pages.items() if name != 'search_dimensions'}
    arch, records = {}, {}
    for source in ('general', 'compute', 'memory'):
        for table in tables[source]:
            for row in table:
                if len(row) > 2 and re.fullmatch(r'[a-z]\d[a-z\d]*', row[0], re.I):
                    if '(arm64)' in row[2]:
                        arch[row[0].lower()] = ('arm', source)
                    if '(x86_64)' in row[2]:
                        arch[row[0].lower()] = ('x86', source)
        for sku, cpu, memory in shape_rows(tables[source], ''):
            family = sku.split('.')[0]
            if not cpu or not memory or family not in arch:
                continue
            category = 'burstable' if source == 'general' and family.startswith('t') else source
            records['EC2', sku] = ['EC2', sku, cpu, memory, arch[family][0], category, source, source]

    for table in tables['t2']:
        for row in table:
            if len(row) >= 3 and re.fullmatch(r't2\.[\da-z]+', row[0]) and number(row[1]) and number(row[2]):
                records['EC2', row[0]] = ['EC2', row[0], number(row[1]), number(row[2]), 'x86', 'burstable', 't2', arch['t2'][1]]
    for table in tables['previous']:
        if table and [cell.lower() for cell in table[0][:4]] == ['instance type', 'memory (gib)', 'processor', 'vcpus']:
            for row in table[1:]:
                if len(row) >= 4 and row[0].startswith('c3.') and row[2].startswith('Intel Xeon') and number(row[3]) and number(row[1]):
                    records['EC2', row[0]] = ['EC2', row[0], number(row[3]), number(row[1]), 'x86', 'compute', 'previous', 'previous']
    if ('EC2', 'c3.large') not in records:
        raise ValueError('Missing official C3 processor/shape')

    cache_shapes = {}
    for sku, cpu, memory in shape_rows(tables['cache'], r'cache\.'):
        values = cache_shapes.setdefault(sku, [set(), set()])
        if cpu is not None:
            values[0].add(cpu)
        if memory is not None:
            values[1].add(memory)
    # RDS and OpenSearch architecture evidence must describe those services' own instance families.
    rds_arch = {}
    for markup in re.findall(r'<p>\s*<b>(db\.[^<]+)</b>\s*</p>', pages['rds'].decode('utf-8'), re.I):
        title = ' '.join(unescape(markup).lower().split())
        family = re.match(r'db\.([a-z][a-z\d]+)', title)
        if family and 'graviton' in title:
            rds_arch[family[1]] = ('arm', 'rds')
        if family and re.search(r'intel xeon|amd epyc', title):
            rds_arch[family[1]] = ('x86', 'rds')
    search_arch = {}
    for table in tables['search']:
        for row in table[1:]:
            if len(row) != 3:
                continue
            heading, types, restrictions = row
            if 'Graviton' in heading or re.search(r'compatible with other Graviton', restrictions):
                search_arch.update({family: ('arm', 'search') for family in re.findall(r'\b([a-z][a-z\d]*)\.[\da-z]+\.search\b', types)})
    search_payload = pages['search_dimensions']
    search_doc = json.loads(gzip.decompress(search_payload) if search_payload.startswith(b'\x1f\x8b') else search_payload)
    if search_doc['manifest']['serviceId'] != 'es' or search_doc['manifest']['source'] != 'es-ondemand':
        raise ValueError('Expected the official OpenSearch instance table')
    search_shapes = {}
    ireland = search_doc['regions']['EU (Ireland)']
    for label, values in search_doc['sets'].items():
        category = {'Compute optimized':'compute','General purpose':'general','Memory optimized':'memory'}.get(label.split(' - ')[1])
        if category is None:
            continue
        for key in set(values).intersection(ireland):
            entry = ireland[key]
            sku = entry.get('Instance Type', '')
            cpu, memory = number(entry.get('vCPU', '')), number(entry.get('Memory (GiB)', ''))
            if re.fullmatch(SIZE+r'\.search', sku) and cpu and memory:
                search_shapes.setdefault(sku, set()).add((cpu, memory, category))
    cache_arch = {family: ('arm', 'cache_arch') for family in ('m6g','r6g')
                  if family in pages['cache_arch'].decode('utf-8').lower() and b'Graviton2' in pages['cache_arch']}
    maximums = {}
    for table in tables['cache_params']:
        if table and any('maxmemory' in column.lower() for column in table[0]):
            for row in table[1:]:
                if len(row) == 2 and re.fullmatch(r'cache\.'+SIZE, row[0]) and number(row[1]):
                    maximums.setdefault(row[0], set()).add(int(number(row[1])))
    if len(maximums) < 20 or 'defaults to 25%' not in pages['cache_reserve'].decode('utf-8'):
        raise ValueError('Missing documented Redis OSS maxmemory or reserve')
    tables_by_kind = [('RDS', 'rds', shape_rows(tables['rds'], r'db\.')),
                      ('ElastiCache', 'cache', ((sku, *(next(iter(v)) if len(v) == 1 else None for v in values))
                                              for sku, values in cache_shapes.items())),
                      ('OpenSearch', 'search', ((sku, None, None) for sku in set(re.findall(
                          r'\b[a-z][a-z\d]*\.[\da-z]+\.search\b', pages['search'].decode('utf-8')))))]
    for kind, source, rows in tables_by_kind:
        for sku, cpu, memory in rows:
            family = sku.split('.')[0 if kind == 'OpenSearch' else 1]
            cpu_arch, arch_source = {'RDS': rds_arch, 'OpenSearch': search_arch, 'ElastiCache': cache_arch}[kind].get(family, (None, None))
            category, type_source = None, None
            if kind == 'OpenSearch' and len(search_shapes.get(sku, ())) == 1:
                cpu, memory, category = next(iter(search_shapes[sku]))
                type_source, source = source, 'search_dimensions'
                ec2 = records.get(('EC2', sku.removesuffix('.search')))
                if cpu_arch is None and ec2 and ec2[2:4] == [cpu, memory]:
                    cpu_arch, arch_source = ec2[4], ec2[7]
            entry = [kind, sku, cpu, memory, cpu_arch, category, source, arch_source]
            cache_bytes = maximums.get(sku, ())
            if kind == 'ElastiCache' and len(cache_bytes) == 1:
                entry += [None, next(iter(cache_bytes))]
            elif type_source:
                entry += [type_source]
            records[kind, sku] = entry
    return [records[key] for key in sorted(records)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True, help='Date the public pages were fetched (YYYY-MM-DD)')
    parser.add_argument('--source-dir', type=Path, help='Use archived <source>.html pages')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
        parser.error('Use YYYY-MM-DD')
    if args.source_dir:
        pages = {name: (args.source_dir / f"{name}.{'json' if name == 'search_dimensions' else 'html'}").read_bytes() for name in SOURCES}
    else:
        pages = {}
        for name, url in SOURCES.items():
            with urlopen(url, timeout=30) as response:
                pages[name] = response.read()
    records = build(pages)
    minimum = {'EC2': 100, 'RDS': 50, 'ElastiCache': 20, 'OpenSearch': 20}
    counts = {kind: sum(record[0] == kind for record in records) for kind in minimum}
    if any(counts[kind] < count for kind, count in minimum.items()):
        raise ValueError(f'Unexpected AWS document layout: {counts}')
    evidence = {key: [url, hashlib.sha256(pages[key]).hexdigest()] for key, url in SOURCES.items()}
    target = Path(__file__).resolve().parents[1] / 'public/aws-spec-data.mjs'
    target.write_text('// Generated by scripts/build_aws_specs.py from AWS public product documentation.\n'
                      f'export const AWS_SPEC_DATE={json.dumps(args.date)};\n'
                      f'export const AWS_SPEC_SOURCES={json.dumps(evidence, indent=1)};\n'
                      'export const AWS_SPEC_RECORDS=[\n' + ',\n'.join(json.dumps(row, separators=(',', ':')) for row in records)
                      + '\n];\n', encoding='utf-8')
    print(counts)


if __name__ == '__main__':
    main()
