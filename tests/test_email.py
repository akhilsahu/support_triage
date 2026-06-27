#!/usr/bin/env python3
"""Quick SMTP test — run from project root: python scripts/test_email.py you@example.com"""

import smtplib
import sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import os

load_dotenv()

TO = "itz.007.786@gmail.com"#sys.argv[1] if len(sys.argv) > 1 else os.getenv("SMTP_USER")
HOST = os.getenv("SMTP_HOST", "")
PORT = int(os.getenv("SMTP_PORT", 465))
USER = os.getenv("SMTP_USER", "")
PASS = os.getenv("SMTP_PASS", "")
FROM = os.getenv("SMTP_FROM", USER)

print(f"Host : {HOST}:{PORT}")
print(f"User : {USER}")
print(f"From : {FROM}")
print(f"To   : {TO}")
print()

if not HOST or not USER:
    print("ERROR: SMTP_HOST / SMTP_USER not set in .env")
    sys.exit(1)

msg = MIMEMultipart("alternative")
msg["Subject"] = "Support247 SMTP test"
msg["From"] = FROM
msg["To"] = TO
msg.attach(MIMEText("<h2>It works!</h2><p>SMTP is configured correctly.</p>", "html"))

try:
    if PORT == 465:
        with smtplib.SMTP_SSL(HOST, PORT) as s:
            s.login(USER, PASS)
            s.sendmail(FROM, TO, msg.as_string())
    else:
        with smtplib.SMTP(HOST, PORT) as s:
            s.starttls()
            s.login(USER, PASS)
            s.sendmail(FROM, TO, msg.as_string())
    print("SUCCESS — email sent, check your inbox.")
except Exception as e:
    print(f"FAILED — {e}")
    sys.exit(1)
