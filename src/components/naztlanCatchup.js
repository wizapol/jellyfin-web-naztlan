import datetime from '../scripts/datetime';

const maps = new Map();
const pending = new Map();

function normalizeId(id) {
    return (id || '').replaceAll('-', '').toLowerCase();
}

export function refreshCatchupMap(apiClient) {
    if (!apiClient) {
        return Promise.resolve(null);
    }
    const serverId = apiClient.serverInfo()?.Id || 'current';
    if (pending.has(serverId)) {
        return pending.get(serverId);
    }
    const request = apiClient.getJSON(apiClient.getUrl('Naztlan/Catchup/Map'))
        .then(result => {
            maps.set(serverId, result.Channels || result.channels || {});
            return maps.get(serverId);
        })
        .catch(error => {
            console.warn('Naztlan catchup map is not available', error);
            maps.set(serverId, {});
            return null;
        })
        .finally(() => pending.delete(serverId));
    pending.set(serverId, request);
    return request;
}

export function getCatchupCapability(item) {
    if (!item?.ChannelId) {
        return null;
    }
    const channelId = normalizeId(item.ChannelId);
    const serverMaps = item.ServerId ? [maps.get(item.ServerId)] : maps.values();
    for (const map of serverMaps) {
        const capability = map?.[channelId] || map?.[item.ChannelId];
        if (capability) {
            return capability;
        }
    }
    return null;
}

export function isProgramAiring(item, now = Date.now()) {
    return item?.Type === 'Program'
        && now >= datetime.parseISO8601Date(item.StartDate).getTime()
        && now < datetime.parseISO8601Date(item.EndDate).getTime();
}

export function hasCatchup(item, now = Date.now()) {
    if (item?.Type !== 'Program' || !item.StartDate || !item.EndDate) {
        return false;
    }
    const capability = getCatchupCapability(item);
    if (!capability) {
        return false;
    }
    const start = datetime.parseISO8601Date(item.StartDate).getTime();
    if (start > now) {
        return false;
    }
    if (isProgramAiring(item, now)) {
        return capability.Startover ?? capability.startover ?? false;
    }
    const days = capability.Days ?? capability.days ?? 0;
    return start >= now - days * 86400000;
}

export function canPlayProgram(item, now = Date.now()) {
    return isProgramAiring(item, now) || hasCatchup(item, now);
}

export function getPlayableItemId(item) {
    return item?.Type === 'Program' && !hasCatchup(item) ? item.ChannelId : item.Id;
}
