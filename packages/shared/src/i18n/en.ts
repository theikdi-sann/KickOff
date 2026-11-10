/**
 * English copy table (P11-07).
 *
 * This is the single place the app's user-facing strings will move to. The
 * shape is pinned by `StringTable` so a future locale (`P11-08`, deferred) can
 * only be added by translating every key — a missing or extra key is a type
 * error instead of a runtime fallback.
 *
 * The table is deliberately limited to copy the app already renders; the
 * screens are migrated to read from it when the locale resolver lands
 * (`P11-09`–`P11-11`, deferred past v1 with the English-only decision in
 * PLAN.md §F).
 */
export interface StringTable {
  readonly common: {
    readonly appName: string;
    readonly brandLine: string;
  };
  readonly tabs: {
    readonly home: string;
    readonly tickets: string;
    readonly profile: string;
  };
  readonly auth: {
    readonly signIn: string;
    readonly email: string;
    readonly password: string;
    readonly demoAccount: string;
    readonly createAccount: string;
  };
  readonly welcome: {
    readonly getStarted: string;
    readonly fixtureFeature: string;
    readonly passFeature: string;
    readonly securityFeature: string;
  };
  readonly home: {
    readonly greetingTitle: string;
    readonly getTickets: string;
    readonly noFixtures: string;
    readonly ticketsFrom: string;
  };
  readonly tickets: {
    readonly title: string;
    readonly active: string;
    readonly past: string;
    readonly browseFixtures: string;
    readonly scanInstruction: string;
  };
  readonly checkout: {
    readonly title: string;
    readonly total: string;
    readonly pay: string;
  };
  readonly settings: {
    readonly title: string;
    readonly subtitle: string;
    readonly matchReminders: string;
    readonly language: string;
    readonly terms: string;
    readonly privacy: string;
    readonly refundPolicy: string;
    readonly signOut: string;
    readonly deleteAccount: string;
  };
  readonly errors: {
    readonly generic: string;
    readonly network: string;
  };
}

export const en: StringTable = {
  common: {
    appName: "KickOff",
    brandLine: "MEMBER APP",
  },
  tabs: {
    home: "Home",
    tickets: "Tickets",
    profile: "Profile",
  },
  auth: {
    signIn: "Sign in",
    email: "Email address",
    password: "Password",
    demoAccount: "Continue with demo fan account",
    createAccount: "Create an account",
  },
  welcome: {
    getStarted: "Get started",
    fixtureFeature: "Fixtures & news",
    passFeature: "Offline QR pass",
    securityFeature: "Secure entry",
  },
  home: {
    greetingTitle: "Are you ready for match day?",
    getTickets: "Get tickets",
    noFixtures: "No fixtures on sale",
    ticketsFrom: "TICKETS FROM",
  },
  tickets: {
    title: "My tickets",
    active: "Active",
    past: "Past",
    browseFixtures: "Browse fixtures",
    scanInstruction: "SCAN AT THE GATE · ONE ENTRY ONLY",
  },
  checkout: {
    title: "Checkout",
    total: "TOTAL",
    pay: "Pay",
  },
  settings: {
    title: "Settings",
    subtitle: "Account",
    matchReminders: "Match reminders",
    language: "Language",
    terms: "Terms of use",
    privacy: "Privacy policy",
    refundPolicy: "Refund policy",
    signOut: "Sign out",
    deleteAccount: "Delete account",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "You appear to be offline. Check your connection and try again.",
  },
};
