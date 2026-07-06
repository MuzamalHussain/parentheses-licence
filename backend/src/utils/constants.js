const ROLES = Object.freeze({
  CUSTOMER: "customer",
  ADMIN: "admin",
  SUPPORT: "support",
});

const PRODUCT_STATUS = Object.freeze({
  DRAFT: "draft",
  PRIVATE: "private",
  PUBLISHED: "published",
  ACTIVE: "active",
  ARCHIVED: "archived",
  DEPRECATED: "deprecated",
  HIDDEN: "hidden",
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
