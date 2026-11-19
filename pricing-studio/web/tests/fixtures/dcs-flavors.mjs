// Fictional ListFlavors responses. These records do not establish real regional availability.
export function flavor(specCode,topology,capacity,{replicas=1,versions='4.0;5.0;6.0',architecture='x86_64',
 shards=1,zones=['eu-west-101a'],maxConnections=10000,bandwidth='128'}={}){
 const size=String(capacity);
 return {spec_code:specCode,cache_mode:topology,engine:'redis',engine_version:versions,product_type:'generic',
  cpu_type:architecture,storage_type:'DRAM',capacity:[size],billing_mode:['Hourly'],pricing_type:'normal',
  cloud_resource_type_code:'hws.resource.type.dcs3',replica_count:replicas,
  attrs:[{capacity:size,name:'sharding_num',value:String(shards)},
   {capacity:size,name:'max_connections',value:String(maxConnections)},{capacity:size,name:'max_bandwidth',value:bandwidth}],
  flavors_available_zones:[{capacity:size,unit:'GB',az_codes:zones}]};
}
export const flavors={spec_type:'instance',flavors:[
 flavor('redis.single.xu1.large.1','single',1),
 flavor('redis.single.xu1.large.2','single',2,{versions:'4.0;5.0;6.0;7.0'}),
 flavor('redis.single.xu1.large.4','single',4),
 flavor('redis.ha.xu1.large.r2.1','ha',1,{replicas:2}),
 flavor('redis.ha.xu1.large.r3.1','ha',1,{replicas:3}),
 flavor('redis.ha.xu1.large.r2.2','ha',2,{replicas:2,versions:'5.0;6.0;7.0'}),
 flavor('redis.ha.xu1.large.r3.2','ha',2,{replicas:3,versions:'5.0;6.0;7.0'}),
 flavor('redis.cluster.xu1.large.r2.4','cluster',4,{replicas:2,versions:'6.0;7.0',shards:3,maxConnections:30000}),
 flavor('redis.proxy.xu1.large.4','proxy',4,{replicas:2,shards:3,maxConnections:20000}),
 flavor('redis.single.au1.large.1','single',1,{architecture:'aarch64',versions:'4.0;5.0',zones:[]})
]};
