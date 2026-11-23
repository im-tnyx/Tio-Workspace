"""Signal only the Linux process instances attested by the Metro starter."""

import json
import os
import signal
import sys
from contextlib import ExitStack

members = json.load(sys.stdin)
with ExitStack() as stack:
    verified = []
    for entry in members:
        pid = entry["pid"]
        try:
            handle = os.pidfd_open(pid)
        except ProcessLookupError:
            continue
        stack.callback(os.close, handle)
        try:
            with open(f"/proc/{pid}/stat", encoding="utf-8") as proc_stat:
                fields = proc_stat.read().rsplit(")", 1)[1].split()
            uid = os.stat(f"/proc/{pid}").st_uid
        except FileNotFoundError:
            continue
        if (
            uid != os.getuid()
            or int(fields[2]) != entry["group"]
            or int(fields[3]) != entry["session"]
            or fields[19] != entry["startTicks"]
        ):
            raise SystemExit("Metro process identity changed before stop")
        verified.append(handle)

    for handle in verified:
        try:
            signal.pidfd_send_signal(handle, signal.SIGTERM)
        except ProcessLookupError:
            pass
