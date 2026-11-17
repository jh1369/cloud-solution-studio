from pathlib import Path
import sys
import unittest
import xml.etree.ElementTree as ET
sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
from catalog_updater.schedule import render_schedule


class ScheduleTest(unittest.TestCase):
    def test_daily_cron_is_fixed_public_update_command(self):
        value=render_schedule('cron','/approved/project with spaces','/approved/python3.12')['tcp-catalog.cron']
        self.assertIn('CRON_TZ=Europe/Berlin',value);self.assertIn('0 7 * * *',value);self.assertIn('catalog_update.py\' check',value)
        command='\n'.join(line for line in value.splitlines() if not line.startswith('#'))
        self.assertNotIn('codex',command.lower());self.assertNotIn('curl',command)

    def test_systemd_timer_is_daily_and_persistent(self):
        files=render_schedule('systemd','/approved/project','/approved/python')
        self.assertIn('Persistent=true',files['pricing-studio-tcp.timer'])
        self.assertIn('Europe/Berlin',files['pricing-studio-tcp.timer'])
        self.assertIn('check',files['pricing-studio-tcp.service'])
        with self.assertRaises(ValueError): render_schedule('systemd','/bad%path','python')

    def test_windows_xml_has_daily_trigger_without_credentials(self):
        value=render_schedule('windows','C:/approved/project','C:/Python/python.exe')['pricing-studio-tcp.xml']
        root=ET.fromstring(value);ns={'t':'http://schemas.microsoft.com/windows/2004/02/mit/task'}
        self.assertEqual(root.find('.//t:DaysInterval',ns).text,'1')
        self.assertEqual(root.find('.//t:Command',ns).text,'C:/Python/python.exe')
        self.assertIsNone(root.find('.//t:Password',ns))
