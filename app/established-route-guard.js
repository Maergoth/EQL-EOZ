import { cropCollisionGeometryForRoute } from './collision-geometry.js';
import { validateRouteGeometryAsync } from './route-validation.js';

/** No established planner result may reach its drawing caller unvalidated. */
export function installEstablishedRouteGuard(app, { getGeometry, getZoneIdentity, onState = () => {} }) {
    const original = app.findNavigationPath.bind(app);
    app.findNavigationPath = async (...args) => {
        const token = args[2];
        const zoneIdentity = getZoneIdentity();
        const shouldCancel = () => token !== app.navigationBuildToken || zoneIdentity !== getZoneIdentity();
        onState({ status:'calculating', violationCount:0 });
        const path = await original(...args);
        if (shouldCancel()) return null;
        if (!path || path.length < 2) {
            onState({ status:'no-path', violationCount:0 });
            return null;
        }
        onState({ status:'validating', violationCount:0 });
        try {
            const geometry = await getGeometry();
            if (shouldCancel()) return null;
            if (!geometry) {
                onState({ status:'rejected', reason:'collision-geometry-unavailable', violationCount:0 });
                return null;
            }
            const crop = await cropCollisionGeometryForRoute(geometry, path, { dropPath:path, shouldCancel });
            if (shouldCancel()) return null;
            if (!crop.ok) {
                onState({ status:'rejected', reason:crop.reason, violationCount:0 });
                return null;
            }
            const validation = await validateRouteGeometryAsync({ geometry:crop.geometry }, path, { shouldCancel });
            if (shouldCancel()) return null;
            onState({
                status:validation.valid ? 'ready' : 'rejected',
                reason:validation.valid ? '' : 'validation-failed',
                violationCount:validation.violations.length
            });
            return validation.valid ? path : null;
        } catch {
            if (!shouldCancel()) onState({ status:'rejected', reason:'validation-unavailable', violationCount:0 });
            return null;
        }
    };
}
