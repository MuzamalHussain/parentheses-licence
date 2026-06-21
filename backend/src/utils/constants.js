const ROLES = Object.freeze({
  CUSTOMER: "customer",
  ADMIN: "admin",
  SUPPORT: "support",
});

const PRODUCT_STATUS = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
});

const RENEWAL_TYPE = Object.freeze({
  RECURRING: "recurring",
  ONE_TIME: "one-time",
});

module.exports = {
  ROLES,
  PRODUCT_STATUS,
  RENEWAL_TYPE,
};
