-- Audit trail for admin actions (role, status or storage limit changes).
-- Logged on the admin's own account; target_id is the user who was changed.
ALTER TYPE "ActivityAction" ADD VALUE 'ADMIN_USER_UPDATED';
