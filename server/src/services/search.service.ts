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
    url.searchParams.append('zoom', '14');
    url.searchParams.append('addressdetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'AnantYatra-Routing-App/1.0',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (!data || !data.address) return data?.display_name || '';

      const address = data.address;
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
        const region = address.county || address.state_district || address.state;
        return region && placeName !== region ? `${placeName}, ${region}` : placeName;
      }
      return data.display_name || '';
    }
  } catch (error) {
    console.error('Reverse geocode error:', error);
  }
  return '';
};

export const batchGetStates = async (coordinates: { lat: number; lon: number }[]): Promise<Record<number, string>> => {
  const result: Record<number, string> = {};
  
  for (let i = 0; i < coordinates.length; i++) {
    try {
      const { lat, lon } = coordinates[i];
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.append('format', 'json');
      url.searchParams.append('lat', lat.toString());
      url.searchParams.append('lon', lon.toString());
      url.searchParams.append('addressdetails', '1');
      url.searchParams.append('zoom', '14');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'AnantYatra-Routing-App/1.0',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.address && data.address.state) {
          result[i] = data.address.state;
        }
      }
      
      // Delay to respect Nominatim limits
      if (i < coordinates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`Error reverse geocoding point ${i}:`, err);
    }
  }
  
  return result;
};

