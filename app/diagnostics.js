function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function cleanLocation(location) {
    if (!location) return null;
    const cleaned = {
        x:finiteNumber(location.x),
        y:finiteNumber(location.y),
        z:finiteNumber(location.z)
    };
    return Object.values(cleaned).every(value => value !== null) ? cleaned : null;
}

function cleanGuidance(guidance) {
    if (!guidance?.active) return null;
    return {
        cue:String(guidance.cue || ''),
        cueKind:String(guidance.cueKind || ''),
        remainingDistance:finiteNumber(guidance.remainingDistance),
        offRouteDistance:finiteNumber(guidance.offRouteDistance),
        distanceToTurn:finiteNumber(guidance.distanceToTurn),
        turnDirection:String(guidance.turnDirection || '')
    };
}

/** Build a support snapshot from an explicit allow-list; paths and identities never enter it. */
export function buildDiagnosticSnapshot({ version, pack, parserState, settings, bridgeInfo, viewerStatus, activeRoute, now } = {}) {
    const state = parserState || {};
    const bridge = bridgeInfo || {};
    const viewer = viewerStatus || {};
    return {
        schema:'eye-of-zomm-diagnostics-v1',
        generatedAt:new Date(now || Date.now()).toISOString(),
        appVersion:String(version || bridge.version || 'unknown'),
        platform:String(bridge.platform || 'unknown'),
        dataPack:{
            version:String(pack?.meta?.version || 'unknown'),
            schemaVersion:finiteNumber(pack?.meta?.schemaVersion),
            sample:Boolean(pack?.meta?.sample || bridge.productionPack === false)
        },
        session:{
            zone:String(state.zone || ''),
            level:finiteNumber(state.level),
            classes:Array.isArray(state.classes) ? state.classes.map(String) : [],
            characterDetected:Boolean(state.character),
            location:cleanLocation(state.location)
        },
        preferences:{
            era:String(settings?.era || ''),
            itemTier:finiteNumber(settings?.itemTier),
            mapMode:String(settings?.mapMode || ''),
            encounterGapSeconds:finiteNumber(settings?.encounterGapSeconds),
            manualLevel:finiteNumber(settings?.manualLevel),
            manualClasses:Array.isArray(settings?.manualClasses) ? settings.manualClasses.map(String) : [],
            minimalMyClassOnly:Boolean(settings?.minimalMyClassOnly),
            minimalNamedOnly:Boolean(settings?.minimalNamedOnly),
            minimalMapVisible:Boolean(settings?.minimalMapVisible),
            minimalRoutingVisible:Boolean(settings?.minimalRoutingVisible),
            itemCurrentZoneOnly:Boolean(settings?.itemCurrentZoneOnly)
        },
        bridge:{
            folderConfigured:Boolean(bridge.eqRootExists),
            logConfigured:Boolean(bridge.logExists),
            logSelection:String(bridge.logSelection || 'automatic')
        },
        viewer:{
            mounted:Boolean(viewer.mounted),
            directorySelected:Boolean(viewer.directorySelected),
            zone:String(viewer.zone || ''),
            mode:String(viewer.mode || ''),
            floors:String(viewer.floors || ''),
            textures:{
                available:finiteNumber(viewer.textures?.available),
                materials:finiteNumber(viewer.textures?.materials),
                resolved:finiteNumber(viewer.textures?.resolved)
            },
            navigation:{
                active:Boolean(viewer.navigation?.ok),
                routed:Boolean(viewer.navigation?.routed),
                source:String(viewer.navigation?.source || ''),
                distance:finiteNumber(viewer.navigation?.distance),
                guidance:cleanGuidance(viewer.navigation?.guidance)
            }
        },
        route:activeRoute ? {
            active:true,
            zone:String(activeRoute.zone || ''),
            status:String(activeRoute.status || ''),
            source:String(activeRoute.source || ''),
            lastRoutedLocation:cleanLocation(activeRoute.lastRoutedLocation),
            guidance:cleanGuidance(activeRoute.guidance)
        } : { active:false }
    };
}
