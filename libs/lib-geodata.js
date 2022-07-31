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
  // const url = `https://restcountries.eu/v3/alpha/${code}`;
  console.log(`getting country from ${url}`);
  const result = await fetch(url).then(res => res.json()).catch(e => {
    console.log("failed to get country");
    return { translations: { lang: 'NO COUNTRY' } };
  });
  console.log("got a result");
  console.log(result);
  return result.translations[lang];
};

const fetchGeoCode = async (lat, lon) => {
  const url = 'http://open.mapquestapi.com/geocoding/v1/reverse?key=' +
    process.env.MAPQUEST_KEY +
    `&location=${lat},${lon}` +
    '&includeRoadMetadata=true&includeNearestIntersection=true';
  console.log("getting location");
  const result = await fetch(url).then(res => res.json())
    .catch(e => {
      console.log("failed to get location");
      return [];
    });
  console.log("got location");
  const found = result.results && result.results[0];
  const location = found && found.locations[0];
  const street = (location.street) ? location.street + ' - ' : '';
  const city = getValFromGeo(location, 'City');
  const countryCode = getValFromGeo(location, 'Country');
  console.log("getting country");
  const country = await fetchCountry(countryCode);
  console.log("got country");
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
    console.log("got an error");
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