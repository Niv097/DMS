# Bank DMS Rollout Checklist

Please share the following details so we can prepare your DMS deployment correctly.

## 1. Domain and Access

1. Production domain for DMS
   Example: `https://dms.yourbank.com`
2. UAT domain for testing
   Example: `https://uat-dms.yourbank.com`
3. Bank technical contact name, email, and phone number
4. Infrastructure / server support contact name, email, and phone number

## 2. Database Details

1. UAT database connection details
2. Production database connection details
3. Database type confirmation
   PostgreSQL
4. Database access allowed from application server

## 3. Server and Storage

1. Server operating system
   `Windows` or `Linux`
2. Application server details
3. File storage location for uploaded documents
4. Backup storage location
5. DR / transfer location for backup package movement

## 4. Security and Network

1. SSL certificate / HTTPS availability
2. Reverse proxy or web server details
   Nginx / IIS / other
3. Firewall rules required for application and database access
4. Whitelisted public IPs if applicable

## 5. Email and Notifications

1. SMTP server name
2. SMTP port
3. Sender email ID
4. SMTP username
5. SMTP password or secure credential process
6. Reply-to / support email ID

## 6. Branding Details

1. Bank display name
2. Short bank code
3. Bank logo
4. Preferred notification sender name

## 7. Backup Preference

1. Bank preferred backup frequency
   `Daily` / `Weekly` / `Monthly`
2. Backup retention expectation if any
3. Confirmation that vendor-side mirror backup is allowed for recovery support

## 8. Go-Live Readiness

1. UAT sign-off contact
2. Production sign-off contact
3. Expected UAT start date
4. Expected go-live date
5. Preferred backup run window
   Example: `1:30 AM`

## 9. Documents To Share

1. Domain confirmation
2. Database details
3. SMTP details
4. Logo file
5. Server path details
6. Security / network approval details

## 10. Final Note

Once the above details are shared, our team will configure:

1. DMS application domain
2. database connection
3. secure login setup
4. file storage
5. automated backup and recovery setup
6. bank branding
7. production readiness validation
