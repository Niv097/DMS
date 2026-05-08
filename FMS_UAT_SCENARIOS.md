# FMS UAT Scenarios

## 1. Bank Department Master And Hierarchy

- Create a top-level FMS department master for the bank.
- Create a sub-department under an existing department.
- Link an FMS department master to an existing DMS department where needed.
- Map multiple branches under a department master.
- Verify FMS automatically creates and refreshes the related library nodes.
- Verify the left tree shows department counts and branch counts correctly.

## 2. Node Hierarchy

- Create HO node.
- Create department node under HO.
- Create sub-department node under department.
- Create branch node under department or sub-department.
- Verify tree renders in hierarchy order.
- Verify node filter scopes document register to selected branch/department tree.

## 3. Inherited Access

- Grant branch-level inherited `View Only` on a department node.
- Sign in as a user from that branch and verify descendant-node documents are visible.
- Verify download stays blocked for `View Only`.
- Upgrade inherited access to `View + Download`.
- Verify download becomes available without creating direct file grants.
- Revoke inherited access and verify visibility disappears.

## 4. Department And Global Access

- Grant inherited access to a linked department master.
- Verify users linked to that department can view descendant documents.
- Verify mapped branch users under that department also inherit access as designed.
- Grant inherited `View Only` to `Whole Bank Scope`.
- Verify non-admin users still stay restricted to `view only` unless explicitly upgraded.
- Revoke department/global inherited access and confirm visibility is removed.

## 5. Cross-Branch Append

- Keep bank append toggle disabled and verify branch append request is blocked.
- Enable append at bank level from super admin.
- Raise append request from target branch to source branch with mandatory reason.
- Approve request and verify source branch records become visible as `View Only`.
- Upgrade append grant to `Download`.
- Revoke append grant with reason and verify access is removed.

## 6. Manual FMS Upload

- Upload a fresh FMS file as `Visible in Register`.
- Upload a fresh FMS file as `Backup Only`.
- Release backup file into visible register.
- Verify file type restrictions block unsupported files.
- Verify classification and owner node are stored correctly.
- Verify richer index fields persist:
  - customer name
  - CIF/customer id
  - account no
  - ID proof no
  - department
  - branch
  - uploader
  - document category
  - tags/custom fields

## 7. Manual Versioning

- Upload a fresh FMS file and note version `v1`.
- Upload next version using `Create as Next Version Of`.
- Verify new version becomes latest.
- Verify older version appears only in history view.
- Open detail and verify version chain lists all versions.

## 8. Indexed Search

- Search by customer name.
- Search by CIF/customer id.
- Search by account number.
- Search by identity reference.
- Search by document reference.
- Search by document category.
- Search by department.
- Search by branch.
- Search by uploader.
- Search by tags/custom index.
- Search by file name.
- Verify register returns only authorized records.

## 9. DMS To FMS Continuity

- Complete DMS workflow to final approval.
- Verify approved file lands in FMS automatically as `Backup Only`.
- Release file into visible register from FMS.
- Verify version/group reference matches DMS document code.

## 10. DMS Draft Back Flow

- Sign in as uploader.
- Fill subject, comment, vertical, department, and choose main document.
- Click top `Back`.
- Verify draft note is created and opens as draft detail.
- Verify note appears in `Pending Submission`.

## 11. Access Governance

- Grant direct user file access.
- Grant entire branch file access.
- Grant inherited node access to branch.
- Grant inherited node access to department.
- Grant inherited node access to whole bank scope.
- Verify file detail shows direct grants separately from inherited node grants.
- Verify audit log entries are created for create/revoke actions.

## 12. Revoke And Expiry Controls

- Create inherited or append grants with expiry.
- Verify expired access stops showing files automatically.
- Revoke active grant with reason.
- Verify revoke audit remains visible.
- Verify expired/revoked grants are not counted as active.

## 13. Security And Rotation

- Reset a user password from admin.
- Verify forced change screen appears.
- Verify OTP/self-service recovery path remains available.
- Verify password rotation forces change after configured age.
