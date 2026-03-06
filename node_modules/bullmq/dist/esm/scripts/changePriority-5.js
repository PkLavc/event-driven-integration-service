const content = `--[[
  Change job priority
  Input:
    KEYS[1] 'wait',
    KEYS[2] 'paused'
    KEYS[3] 'meta'
    KEYS[4] 'prioritized'
    KEYS[5] 'pc' priority counter
    ARGV[1] priority value
    ARGV[2] job key
    ARGV[3] job id
    ARGV[4] lifo
    Output:
       0  - OK
      -1  - Missing job
]]
local jobKey = ARGV[2]
local jobId = ARGV[3]
local priority = tonumber(ARGV[1])
local rcall = redis.call
-- Includes
--[[
  Function to add job considering priority.
]]
-- Includes
--[[
  Function priority marker to wait if needed
  in order to wake up our workers and to respect priority
  order as much as possible
]]
local function addPriorityMarkerIfNeeded(waitKey)
  local waitLen = rcall("LLEN", waitKey)
  if waitLen == 0 then
    rcall("LPUSH", waitKey, "0:0")
  end
end
--[[
  Function to get priority score.
]]
local function getPriorityScore(priority, priorityCounterKey)
  local prioCounter = rcall("INCR", priorityCounterKey)
  return priority * 0x100000000 + prioCounter % 0x100000000
end
local function addJobWithPriority(waitKey, prioritizedKey, priority, paused, jobId, priorityCounterKey)
  local score = getPriorityScore(priority, priorityCounterKey)
  rcall("ZADD", prioritizedKey, score, jobId)
  if not paused then
    addPriorityMarkerIfNeeded(waitKey)
  end
end
--[[
  Function to check for the meta.paused key to decide if we are paused or not
  (since an empty list and !EXISTS are not really the same).
]]
local function getTargetQueueList(queueMetaKey, waitKey, pausedKey)
  if rcall("HEXISTS", queueMetaKey, "paused") ~= 1 then
    return waitKey, false
  else
    return pausedKey, true
  end
end
if rcall("EXISTS", jobKey) == 1 then
  local target, paused = getTargetQueueList(KEYS[3], KEYS[1], KEYS[2])
  if rcall("ZREM", KEYS[4], jobId) > 0 then
    addJobWithPriority(KEYS[1], KEYS[4], priority, paused, jobId, KEYS[5])
  else
    local numRemovedElements = rcall("LREM", target, -1, jobId)
    if numRemovedElements > 0 then
      -- Standard or priority add
      if priority == 0 then
        -- LIFO or FIFO
        local pushCmd = ARGV[4] == '1' and 'RPUSH' or 'LPUSH';
        rcall(pushCmd, target, jobId)
      else
        addJobWithPriority(KEYS[1], KEYS[4], priority, paused, jobId, KEYS[5])
      end
    end
  end
  rcall("HSET", jobKey, "priority", priority)
  return 0
else
  return -1
end
`;
export const changePriority = {
    name: 'changePriority',
    content,
    keys: 5,
};
//# sourceMappingURL=changePriority-5.js.map