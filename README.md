# Blob-images-api starter

## fixPhotoDb

Function added to fix photos in Db

Problem: sometimes a photo will be uploaded to S3, but not added to DB.
This is due to the `createPhoto` function - which updated DB - sometimes fails (silently for user)

This function fixes that.

Can only be invoked from AWS Console - where you need to send a test event with event structure:
```json
{
    "userID": "USER_ID_FOLDER",
    "dateTimeFrom": "2022-01-25T16:01:50.000Z"
}
```

