function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function cleanToken(value) {
    return String(value || '').replace(/[^a-z0-9._:-]/gi, '').slice(0, 80);
}

function cleanSpatialStatus(spatial) {
    const collision = spatial?.collision || {};
    const candidate = spatial?.candidate || {};
    return {
        collision:{
            status:cleanToken(collision.status),
            zone:cleanToken(collision.zone),
            format:cleanToken(collision.format),
            reason:cleanToken(collision.reason),
            buildMs:finiteNumber(collision.buildMs),
            sourceMeshes:finiteNumber(collision.sourceMeshes),
            vertices:finiteNumber(collision.vertices),
            triangles:finiteNumber(collision.triangles),
            skippedTriangles:finiteNumber(collision.skippedTriangles)
        },
        candidate:{
            status:cleanToken(candidate.status),
            reason:cleanToken(candidate.reason),
            engine:cleanToken(candidate.engine),
            engineVersion:cleanToken(candidate.engineVersion),
            fallbackAvailable:Boolean(candidate.fallbackAvailable),
            cropMs:finiteNumber(candidate.cropMs),
            sourceTriangles:finiteNumber(candidate.sourceTriangles),
            selectedTriangles:finiteNumber(candidate.selectedTriangles),
            corridorMargin:finiteNumber(candidate.corridorMargin),
            generationMs:finiteNumber(candidate.generationMs),
            queryMs:finiteNumber(candidate.queryMs),
            totalMs:finiteNumber(candidate.totalMs),
            violationCount:finiteNumber(candidate.violationCount)
        }
    };
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
        schema:'eye-of-zomm-diagnostics-v2',
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
            locationDetected:Boolean(state.location)
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
            },
            spatial:cleanSpatialStatus(viewer.spatial)
        },
        route:activeRoute ? {
            active:true,
            zone:String(activeRoute.zone || ''),
            status:String(activeRoute.status || ''),
            source:String(activeRoute.source || ''),
            lastRoutedLocationDetected:Boolean(activeRoute.lastRoutedLocation),
            guidance:cleanGuidance(activeRoute.guidance)
        } : { active:false }
    };
}
