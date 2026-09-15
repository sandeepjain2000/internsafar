# -*- coding: utf-8 -*-
"""Shared InternSafar workbook column schema (Boarders names + IP extras)."""

# Boarders order first, then InternSafar keep/extra columns.
COLS = [
    "ID",
    "Module / Section",
    "Type",
    "Issue Summary",
    "Description",
    "Suggestion / Expected Behaviour",
    "Reference",
    "Doc Status",
    "Severity / Priority",
    "Test Status",
    "Date Verified",
    "Comments / Notes",
    "Dev comment",
    "Requirement",
    "Phase",
    "Estimate Hr",
    # InternSafar keep / extras
    "Role(s)",
    "Preconditions",
    "Actual Result",
    "Automation",
    "Feature",
    "Legacy ID",
]

# Old InternSafar header → new Boarders-aligned name
OLD_TO_NEW = {
    "TC ID": "ID",
    "Module": "Module / Section",
    "Feature": "Feature",
    "Title": "Issue Summary",
    "Priority": "Severity / Priority",
    "Type": "Type",
    "Role(s)": "Role(s)",
    "Preconditions": "Preconditions",
    "Test Steps": "Description",
    "Expected Result": "Suggestion / Expected Behaviour",
    "Test Data / Notes": "Comments / Notes",
    "Automation": "Automation",
    "Status": "Test Status",
    "Actual Result": "Actual Result",
    "Executed At": "Date Verified",
    "Legacy ID": "Legacy ID",
}

ID_ALIASES = ("ID", "TC ID")
STATUS_ALIASES = ("Test Status", "Status")
ACTUAL_ALIASES = ("Actual Result",)
DATE_ALIASES = ("Date Verified", "Executed At")
LEGACY_ALIASES = ("Legacy ID",)
