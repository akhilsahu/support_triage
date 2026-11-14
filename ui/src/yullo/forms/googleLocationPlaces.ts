import { geocodeArea, loadLocationMaps, validPoint, type LatLng, type LocationSelection } from './googleLocationMaps';

type AddressComponent = { longText?: string; shortText?: string; types: string[] };
interface Place {
  displayName?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: LatLng;
  fetchFields(request: { fields: string[] }): Promise<unknown>;
}
export interface PlacePrediction {
  placeId: string;
  text: { toString(): string };
  toPlace(): Place;
}
interface PlacesLibrary {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: { fetchAutocompleteSuggestions(request: {
    input: string; sessionToken: object; includedPrimaryTypes?: string[]; includedRegionCodes?: string[];
  }): Promise<{ suggestions: { placePrediction?: PlacePrediction }[] }> };
}
let loading: Promise<PlacesLibrary> | undefined;
export function loadLocationPlaces(): Promise<PlacesLibrary> {
  if (!loading) loading = loadLocationMaps().then(async sdk => {
    if (!sdk.importLibrary) throw new Error('Places library unavailable');
    return await sdk.importLibrary('places') as PlacesLibrary;
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export async function selectLocationPrediction(prediction: PlacePrediction): Promise<LocationSelection> {
  const place = prediction.toPlace();
  await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'addressComponents', 'location'] });
  if (!place.location) throw new Error('Place has no map location');
  const point = { lat: place.location.lat(), lng: place.location.lng() };
  if (!validPoint(point)) throw new Error('Invalid map location');
  const area = geocodeArea({
    formatted_address: place.formattedAddress || '', geometry: { location: place.location },
    address_components: place.addressComponents?.map(part => ({
      long_name: part.longText || '', short_name: part.shortText || '', types: part.types,
    })),
  });
  return { ...point, ...area, name: place.displayName || place.formattedAddress?.split(',')[0], address: place.formattedAddress };
}
