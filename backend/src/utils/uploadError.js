export const getUploadErrorResponse = (error, resourceLabel) => {
    if (error?.code === "LIMIT_FILE_SIZE") {
        return { status: 413, message: `${resourceLabel} must be 10 MB or smaller` };
    }

    if (typeof error?.code === "string" && error.code.startsWith("LIMIT_")) {
        return {
            status: 400,
            message: "Upload contains too many files or fields, too many parts, or an unexpected file field"
        };
    }

    if (error?.code) {
        return { status: 500, message: `Unable to store ${resourceLabel.toLowerCase()}` };
    }

    return {
        status: 400,
        message: resourceLabel === "Document"
            ? "Only PDF, JPG and PNG documents are allowed"
            : "Only PDF, JPG and PNG receipts are allowed"
    };
};
