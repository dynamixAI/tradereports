# Security Policy

## Reporting a vulnerability

Please do not report security problems in public issues.

Use GitHub's private reporting instead: go to the **Security** tab of this repository and click **Report a vulnerability**.

Please include:

- what the problem is and where it is
- steps to reproduce it
- what an attacker could do with it

You should get a reply within 7 days. Once a fix is released, you will be credited unless you ask not to be.

## Supported versions

TradeReports is in early development. Only the latest version on the `main` branch receives security fixes.

## How user data is handled

- Files are read in the browser and are never uploaded to a server.
- Client data is never stored in browser storage, links or logs.
- Only settings, such as column matches, are saved in the browser.

## In scope

- Any way the app could send user data off the user's computer
- Cross-site scripting or script injection, including through crafted CSV files
- Vulnerable dependencies

## Out of scope

- Problems that need physical access to an unlocked device
- Issues in third-party software such as Jobber or Tradify
