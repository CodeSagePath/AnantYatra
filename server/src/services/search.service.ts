export const searchPlaces = async (query: string) => {
  try {
    // We use Nominatim (OpenStreetMap's free geocoding service).
    // Note: Nominatim requires a valid User-Agent header.
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.append('format', 'json');
    url.searchParams.append('q', query);
    url.searchParams.append('addressdetails', '1');
    url.searchParams.append('limit', '5');
    // We can restrict search to India since this is AnantYatra and we built the India map
    url.searchParams.append('countrycodes', 'in');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'AnantYatra-Routing-App/1.0',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API Error: ${response.statusText}`);
    }

    const data = await response.json();

    // Map the response to a clean, standardized format for the frontend
    return data.map((place: any) => ({
      name: place.name || place.display_name.split(',')[0],
      display_name: place.display_name,
      lat: parseFloat(place.lat),
      lon: parseFloat(place.lon),
    }));
  } catch (error) {
    console.error('Error fetching places:', error);
    throw error;
  }
};

export const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.append('format', 'json');
    url.searchParams.append('lat', lat.toString());
    url.searchParams.append('lon', lon.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'AnantYatra-Routing-App/1.0',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.display_name || '';
    }
  } catch (error) {
    console.error('Reverse geocode error:', error);
  }
  return '';
};

