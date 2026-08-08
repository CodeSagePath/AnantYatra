export const reverseGeocodeClient = async (lat: number, lon: number): Promise<string | null> => {
  try {
    // OpenStreetMap Nominatim Free API
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          // Nominatim requires a User-Agent to avoid blocking
          'User-Agent': 'AnantYatraLocationTracker/1.0'
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data || !data.address) return null;

    const address = data.address;

    // Prefer granular, localized place names (village, suburb, neighborhood, town)
    const placeName = 
      address.village || 
      address.suburb || 
      address.neighbourhood ||
      address.hamlet ||
      address.town || 
      address.city_district ||
      address.road ||
      address.city;

    if (placeName) {
      // Append county or state district if available to give context
      const region = address.county || address.state_district || address.state;
      return region && placeName !== region ? `${placeName}, ${region}` : placeName;
    }

    // Fallback to display name (which can be very long)
    return data.display_name?.split(',').slice(0, 2).join(',') || null;

  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return null;
  }
};
