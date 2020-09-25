module.exports.domain = () => ({
    'dev': 'api-dev.clubalmanac.com',
    'prod': 'api.clubalmanac.com'
});

module.exports.photoTable = () => ({
    'dev': 'blob-images-photos-dev',
    'prod': 'blob-images-photos'
});

module.exports.photoBucket = () => ({
    'dev': 'blob-images-dev',
    'prod': 'blob-images'
});