export const persistGoogleRefreshIfUnchanged = async ({
    model,
    snapshot,
    accessTokenEncrypted,
    tokenExpiresAt
}) => model.findOneAndUpdate(
    {
        _id: snapshot._id,
        accessTokenEncrypted: snapshot.accessTokenEncrypted,
        refreshTokenEncrypted: snapshot.refreshTokenEncrypted,
        connectedAt: snapshot.connectedAt
    },
    {
        $set: { accessTokenEncrypted, tokenExpiresAt }
    },
    { new: true, runValidators: true }
).select("+accessTokenEncrypted +refreshTokenEncrypted");
