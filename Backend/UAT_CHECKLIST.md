# UAT Checklist

## 1. Roles

Test with:

- SUPER_ADMIN
- ADMIN
- INITIATOR
- RECOMMENDER
- APPROVER
- AUDITOR

Signoff record:

- [ ] SUPER_ADMIN signoff captured
- [ ] ADMIN signoff captured
- [ ] INITIATOR signoff captured
- [ ] RECOMMENDER signoff captured
- [ ] APPROVER signoff captured
- [ ] AUDITOR signoff captured

## 2. Tenant and Branch Isolation

- [ ] HDFC user cannot see SBI data
- [ ] SBI user cannot see HDFC data
- [ ] branch user cannot see unauthorized branch data
- [ ] multi-branch user can see assigned branches only

## 3. User Management

- [ ] tenant creation works
- [ ] branch creation works
- [ ] user creation works
- [ ] reset password works
- [ ] self-admin protection works
- [ ] inactive user cannot log in

## 4. Password Flows

- [ ] first login forces password change
- [ ] normal password change works
- [ ] password confirmation feedback works
- [ ] caps-lock warning appears

## 5. Note Workflow

- [ ] initiator uploads note
- [ ] main and supporting files save correctly
- [ ] recommender can recommend
- [ ] approver can approve
- [ ] rejection path works
- [ ] version re-upload works
- [ ] latest version behavior works

## 6. Approved Artifact

- [ ] approved PDF downloads
- [ ] watermark appears on document pages
- [ ] summary page appears
- [ ] supporting files are not watermarked

## 7. Audit and Notifications

- [ ] note audit export Excel works
- [ ] note audit export PDF works
- [ ] admin audit listing works
- [ ] real-time notification feed updates
- [ ] notification read and read-all work

## 8. Production Security and Operations

- [ ] HTTPS access verified through reverse proxy
- [ ] direct backend port is not publicly exposed
- [ ] strong rotated production JWT secret applied
- [ ] `ENABLE_DEMO=false` verified in production candidate
- [ ] demo login buttons hidden in production candidate
- [ ] backup script executed successfully
- [ ] storage backup executed successfully
- [ ] restore drill completed and validated
- [ ] upload scanning tested or formally waived by bank
- [ ] log retention policy agreed and scheduled
- [ ] file storage path is mounted to secure persistent storage

## 9. Failure Handling

- [ ] invalid token redirects correctly
- [ ] rate limiting returns safe error
- [ ] validation errors are readable
- [ ] production-disabled demo delete endpoints are blocked
