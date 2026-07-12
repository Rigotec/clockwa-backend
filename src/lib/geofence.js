import { getDistance } from "geolib";

/**
 * Returns true if (lat, lng) is within radiusMeters of the site's center.
 */
export function isWithinGeofence(lat, lng, site) {
  const radius = site.radius_meters || 150;
  const distance = getDistance(
    { latitude: lat, longitude: lng },
    { latitude: site.latitude, longitude: site.longitude }
  );
  return distance <= radius;
}
