Update this. make a dedicated api server that job will be that job will be backup postgres dbs.
Where i can do this actions:

- can add a new postgres db to backup with connection details (host, port, dbname, user, password). backup rotation policy (e.g., keep last N backups, keep backups for M days)
- each db can be configure where the backups will be stored (s3, r2) (each backup can have its own storage configuration). Also same storage can be shared across multiple dbs.
- configure backup schedule (e.g., daily, weekly) - corn expression based
- custom discord based notifications for backup status (success, failure)
- view list of configured databases and their backup schedules
- trigger manual backup for a specific database
- view backup history for each database (timestamp, status, size)
- delete a configured database from backup list
- restore a database from a specific backup
- stats and monitoring (e.g., total backups, success rate, failure rate)
- for authentication use JWT tokens (for login will use one time otp sent via discord)

This system will have a RESTful API design have its own database to store configuration and backup history. (use postgres for this too). Use go programming language for implementation.

There is already working backup system here: main.go.bk
