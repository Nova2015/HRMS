export const isTransactionUnavailable = (error) => Boolean(
    error?.hasErrorLabel?.("TransientTransactionError") ||
    error?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
    /transaction numbers are only allowed|replica set|mongos/i.test(error?.message || "")
);
