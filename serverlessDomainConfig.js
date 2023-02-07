module.exports.domain = () => ({
    'dev': 'api-dev.clubalmanac.com',
    'prod': 'api.clubalmanac.com'
});

module.exports.webmasterid = () => ({
    'dev': 'U1e2a5628-c667-4e1e-82ff-e03e7020e433',
    'prod': 'U5db556ee-2716-4642-b47f-80e8b99bd70a'
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