import { makeDateStr } from 'blob-common/core/date';
import { create as exifCreate } from 'exif-parser';
import fetch from 'node-fetch';

const getValFromGeo = (obj, key) => (
  (obj.adminArea1Type === key) ? obj.adminArea1
    : (obj.adminArea2Type === key) ? obj.adminArea2
      : (obj.adminArea3Type === key) ? obj.adminArea3
        : (obj.adminArea4Type === key) ? obj.adminArea4
          : (obj.adminArea5Type === key) ? obj.adminArea5
            : obj.adminArea6
);

const fetchCountry = async (code, lang = 'nl') => {
  const url = `https://restcountries.eu/rest/v2/alpha/${code}`;
  const result = await fetch(url).then(res => res.json());
  return result.translations[lang];
};

const fetchGeoCode = async (lat, lon) => {
  const url = 'http://open.mapquestapi.com/geocoding/v1/reverse?key=' +
    process.env.MAPQUEST_KEY +
    `&location=${lat},${lon}` +
    '&includeRoadMetadata=true&includeNearestIntersection=true';
  const result = await fetch(url).then(res => res.json());
  const found = result.results && result.results[0];
  const location = found && found.locations[0];
  const street = (location.street) ? location.street + ' - ' : '';
  const city = getValFromGeo(location, 'City');
  const countryCode = getValFromGeo(location, 'Country');
  const country = await fetchCountry(countryCode);
  return location ?
    street + (city ? city + ' - ' : '') + country
    : '';
};

const getExif = (fileResult) => {
  const { Body } = fileResult;
  try {
    const parser = exifCreate(Body);
    const result = parser.parse();
    return result;
  } catch (error) {
    return { error: true };
  }
};

// takes a result from S3 get and tries to extract exifData into { exifDate, exifLat, exifLon, exifAddress }
export const getExifData = async (fileResult) => {
  const exifItem = getExif(fileResult);
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
    const geoInfo = await fetchGeoCode(lat, lon);
    const exifData = {
      exifLon: lon,
      exifLat: lat,
      exifAddress: geoInfo
    };
    updateObj = { ...updateObj, ...exifData };
  };
  return updateObj;
};