-- Custom SQL migration file, put your code below! --

-- 移除已废弃的用户设置字段（upstreamId 相关）
-- 这些字段在重构后不再需要，前端只需保存 aimodelId

-- 删除废弃的绘图设置（上游ID相关）
DELETE FROM user_settings WHERE key IN (
  'drawing.aiOptimizeUpstreamId',
  'drawing.aiOptimizeModelName',
  'drawing.embeddedUpstreamId',
  'drawing.workbenchUpstreamId'
);