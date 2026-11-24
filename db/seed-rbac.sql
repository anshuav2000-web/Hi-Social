-- Meta/Instagram OAuth: the requested permission sets per login flow.
-- Kept in SQL so the integration center can render the exact diagnostic list.

INSERT INTO permissions (key, description, category) VALUES
  ('workspace.read',        'View workspace data',                         'workspace'),
  ('workspace.manage',      'Manage workspace settings and members',       'workspace'),
  ('client.read',           'View clients and brand profiles',             'clients'),
  ('client.manage',         'Create and edit clients',                     'clients'),
  ('content.read',          'View content, calendar and planner',          'content'),
  ('content.write',         'Create and edit content',                     'content'),
  ('content.approve',       'Approve or reject content',                   'content'),
  ('content.publish',       'Schedule and publish content',                'content'),
  ('media.read',            'View media library',                          'media'),
  ('media.write',           'Upload and organise media',                   'media'),
  ('task.read',             'View tasks',                                  'tasks'),
  ('task.write',            'Create and assign tasks',                     'tasks'),
  ('inbox.read',            'View social inbox',                           'inbox'),
  ('inbox.write',           'Reply to and moderate conversations',         'inbox'),
  ('analytics.read',        'View analytics and reports',                  'analytics'),
  ('report.export',         'Export reports',                              'analytics'),
  ('integration.manage',    'Connect and manage social accounts',          'integrations'),
  ('automation.manage',     'Create and run automations',                  'automation'),
  ('admin.view',            'Open the admin control center',               'admin'),
  ('admin.manage',          'Manage all users, roles and system settings',  'admin')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (key, name, description, rank) VALUES
  ('super_admin',        'Super Admin',           'Full platform control, including the admin control center', 100),
  ('workspace_admin',    'Workspace Admin',       'Manage workspace, members, clients and all content',        90),
  ('social_media_manager','Social Media Manager', 'Plan, schedule and publish content; manage inbox',          80),
  ('content_writer',     'Content Writer',        'Create captions, briefs and copy for assigned posts',       70),
  ('graphic_designer',   'Graphic Designer',      'Deliver creative assets for assigned posts',                70),
  ('video_editor',       'Video Editor',          'Deliver video and reel assets',                             70),
  ('approver',           'Approver',              'Review and approve content and tasks',                      75),
  ('analyst',            'Analyst',               'Read analytics and export reports',                         60),
  ('client_viewer',      'Client Viewer',         'Read-only access to their own client workspace',            20)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('super_admin','workspace.read'),('super_admin','workspace.manage'),('super_admin','client.read'),
  ('super_admin','client.manage'),('super_admin','content.read'),('super_admin','content.write'),
  ('super_admin','content.approve'),('super_admin','content.publish'),('super_admin','media.read'),
  ('super_admin','media.write'),('super_admin','task.read'),('super_admin','task.write'),
  ('super_admin','inbox.read'),('super_admin','inbox.write'),('super_admin','analytics.read'),
  ('super_admin','report.export'),('super_admin','integration.manage'),('super_admin','automation.manage'),
  ('super_admin','admin.view'),('super_admin','admin.manage'),
  ('workspace_admin','workspace.read'),('workspace_admin','workspace.manage'),('workspace_admin','client.read'),
  ('workspace_admin','client.manage'),('workspace_admin','content.read'),('workspace_admin','content.write'),
  ('workspace_admin','content.approve'),('workspace_admin','content.publish'),('workspace_admin','media.read'),
  ('workspace_admin','media.write'),('workspace_admin','task.read'),('workspace_admin','task.write'),
  ('workspace_admin','inbox.read'),('workspace_admin','inbox.write'),('workspace_admin','analytics.read'),
  ('workspace_admin','report.export'),('workspace_admin','integration.manage'),('workspace_admin','automation.manage'),
  ('workspace_admin','admin.view'),
  ('social_media_manager','workspace.read'),('social_media_manager','client.read'),('social_media_manager','content.read'),
  ('social_media_manager','content.write'),('social_media_manager','content.publish'),('social_media_manager','media.read'),
  ('social_media_manager','media.write'),('social_media_manager','task.read'),('social_media_manager','task.write'),
  ('social_media_manager','inbox.read'),('social_media_manager','inbox.write'),('social_media_manager','analytics.read'),
  ('social_media_manager','report.export'),('social_media_manager','automation.manage'),
  ('content_writer','workspace.read'),('content_writer','client.read'),('content_writer','content.read'),
  ('content_writer','content.write'),('content_writer','media.read'),('content_writer','media.write'),
  ('content_writer','task.read'),('content_writer','task.write'),
  ('graphic_designer','workspace.read'),('graphic_designer','client.read'),('graphic_designer','content.read'),
  ('graphic_designer','media.read'),('graphic_designer','media.write'),('graphic_designer','task.read'),
  ('graphic_designer','task.write'),
  ('video_editor','workspace.read'),('video_editor','client.read'),('video_editor','content.read'),
  ('video_editor','media.read'),('video_editor','media.write'),('video_editor','task.read'),('video_editor','task.write'),
  ('approver','workspace.read'),('approver','client.read'),('approver','content.read'),('approver','content.approve'),
  ('approver','content.publish'),('approver','media.read'),('approver','task.read'),('approver','task.write'),
  ('approver','analytics.read'),
  ('analyst','workspace.read'),('analyst','client.read'),('analyst','content.read'),('analyst','media.read'),
  ('analyst','task.read'),('analyst','analytics.read'),('analyst','report.export'),
  ('client_viewer','workspace.read'),('client_viewer','content.read'),('client_viewer','media.read'),
  ('client_viewer','analytics.read'),('client_viewer','task.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;
