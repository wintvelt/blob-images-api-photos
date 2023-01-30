import { makeDateStr } from 'blob-common/core/date';
import { create as exifCreate } from 'exif-parser';
import fetch, { AbortError } from 'node-fetch';
import { transliterate } from 'transliteration';

const getValFromGeo = (obj, key) => (
  (obj.adminArea1Type === key) ? obj.adminArea1
    : (obj.adminArea2Type === key) ? obj.adminArea2
      : (obj.adminArea3Type === key) ? obj.adminArea3
        : (obj.adminArea4Type === key) ? obj.adminArea4
          : (obj.adminArea5Type === key) ? obj.adminArea5
            : obj.adminArea6
);

const fetchCountry = (countryCode, lang = 'nl') => {
  // TODO: fetch gives unexpected behavior on timeout (!!)
  const regionNames = new Intl.DisplayNames(
    [lang], { type: 'region' }
  );

  return regionNames.of(countryCode);
};

const tr = (string) => {
  const trString = transliterate(string);
  return trString.charAt(0).toUpperCase() + trString.slice(1);
};

export const fetchGeoCode = async (lat, lon) => {
  // TODO: fetch gives unexpected behavior on timeout (!!)
  const url = 'http://www.mapquestapi.com/geocoding/v1/reverse?key=' +
    process.env.MAPQUEST_KEY +
    `&location=${lat},${lon}` +
    '&includeRoadMetadata=true&includeNearestIntersection=true';
  console.log("getting location");

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 2000);

  let result;
  try {
    const response = await fetch(url, { signal: controller.signal });
    result = await response.json();
  } catch (error) {
    if (error instanceof AbortError) {
      console.log("get location timed out");
      return {};
    } else {
      console.log("get location failed");
    }
  } finally {
    clearTimeout(timeout);
  }

  const found = result?.results && result.results[0];
  const location = found && found.locations[0];
  if (!location) return '';

  const street = (location?.street) ? location.street + ' - ' : '';
  const city = getValFromGeo(location, 'City');
  const countryCode = getValFromGeo(location, 'Country');
  console.log("getting country");
  const country = fetchCountry(countryCode);
  console.log("got country");
  const address = tr(street) + (city ? tr(city) + ' - ' : '') + country;

  return address;
};

const getExif = (fileResult) => {
  const { Body } = fileResult;
  try {
    const parser = exifCreate(Body);
    const result = parser.parse();
    return result;
  } catch (error) {
    console.log("got an error parsing exif from file");
    return { error: true };
  }
};

// takes a result from S3 get and tries to extract exifData into { exifDate, exifLat, exifLon, exifAddress }
export const getExifData = async (fileResult) => {
  console.log("getting exifItem");
  const exifItem = getExif(fileResult);
  console.log("got exifItem");
  if (exifItem.error) return {};

  let updateObj = {};
  const createDate = exifItem.tags?.CreateDate;
  if (createDate) {
    const exifDate = new Date(createDate * 1000);
    const exifDateStr = makeDateStr(exifDate);
    updateObj.exifDate = exifDateStr;
  };
  const withGPS = exifItem.tags?.GPSLatitudeRef;
  if (withGPS) {
    const lat = exifItem.tags.GPSLatitude;
    const lon = exifItem.tags.GPSLongitude;
    console.log("getting geoData");
    const geoInfo = await fetchGeoCode(lat, lon);
    console.log("got geoData");
    const exifData = {
      exifLon: lon,
      exifLat: lat,
      exifAddress: geoInfo
    };
    updateObj = { ...updateObj, ...exifData };
  };
  return updateObj;
};