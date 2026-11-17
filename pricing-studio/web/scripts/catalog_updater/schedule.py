"""Generate local daily jobs; never installs or starts a scheduler."""
from pathlib import Path
import shlex
import subprocess
import xml.etree.ElementTree as ET


def render_schedule(scheduler, root, python):
    root = str(root)
    script = str(Path(root) / "scripts/catalog_update.py")
    args = [script, "check"]
    if scheduler == "cron":
        command = " ".join(shlex.quote(s) for s in [python, *args])
        return {"tcp-catalog.cron": f"# Install locally with crontab after review; no Codex process required.\nMAILTO=\"\"\nCRON_TZ=Europe/Berlin\n0 7 * * * {command}\n"}
    if scheduler == "systemd":
        if any(c in root+python for c in ['\n','\r','%']):
            raise ValueError("Unsupported systemd path characters")
        quote = lambda s: '"' + s.replace('\\','\\\\').replace('"','\\"') + '"'
        command = " ".join(quote(s) for s in [python, *args])
        return {"pricing-studio-tcp.service": f"[Unit]\nDescription=Check official TCP pricing catalog\n[Service]\nType=oneshot\nWorkingDirectory={quote(root)}\nExecStart={command}\nUMask=0077\n", "pricing-studio-tcp.timer": "[Unit]\nDescription=Daily TCP public price check\n[Timer]\nOnCalendar=*-*-* 07:00:00 Europe/Berlin\nPersistent=true\nRandomizedDelaySec=300\n[Install]\nWantedBy=timers.target\n"}
    if scheduler == "windows":
        task = ET.Element("Task", version="1.2", xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task")
        triggers = ET.SubElement(task, "Triggers"); trigger = ET.SubElement(triggers, "CalendarTrigger")
        ET.SubElement(trigger, "StartBoundary").text = "2026-01-01T07:00:00"
        ET.SubElement(trigger, "Enabled").text = "true"
        ET.SubElement(ET.SubElement(trigger, "ScheduleByDay"), "DaysInterval").text = "1"
        settings = ET.SubElement(task, "Settings"); ET.SubElement(settings, "StartWhenAvailable").text = "true"
        actions = ET.SubElement(task, "Actions"); execute = ET.SubElement(actions, "Exec")
        ET.SubElement(execute, "Command").text = python
        ET.SubElement(execute, "Arguments").text = subprocess.list2cmdline(args)
        ET.SubElement(execute, "WorkingDirectory").text = root
        return {"pricing-studio-tcp.xml": ET.tostring(task, encoding="unicode")}
    raise ValueError("Unknown local scheduler")
