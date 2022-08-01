module.exports.domain = () => ({
    'dev': 'api-dev.clubalmanac.com',
    'prod': 'api.clubalmanac.com'
});

module.exports.photoTable = () => ({
    'dev': 'blob-images-photos-dev',
    'prod': 'blob-images-photos-prod'
});

module.exports.photoBucket = () => ({
    'dev': 'blob-images-dev',
    'prod': 'blob-images'
});

module.exports.createPhotoArn = () => ({
    'dev': 'arn:aws:lambda:eu-central-1:899888592127:function:blob-images-api-photos-dev-createPhoto',
    'prod': 'arn:aws:lambda:eu-central-1:899888592127:function:blob-images-api-photos-prod-createPhoto'
});