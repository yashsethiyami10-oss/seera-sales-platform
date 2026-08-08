export type UiLanguage = "EN" | "HI";

const EN = {
  protectedPortal: "Seera protected portal", authenticatedAs: "Authenticated as", language: "Language", english: "English", hindi: "Hindi",
  unavailable: "Portal temporarily unavailable", accessDenied: "Access denied", disabledMessage: "This portal is disabled by an approved feature flag.", deniedMessage: "This portal is unavailable for the authenticated identity.", reserved: "This governed portal shell remains reserved for its frozen roadmap phase.",
  today: "Today", beatRoadmap: "Beat Roadmap", retailers: "Retailers", orders: "Orders", dsr: "Daily Sales Report", teamFieldwork: "Team Fieldwork", jointWorking: "Joint Working", partnerDevelopment: "Partner Development", approvals: "Approvals", assistedOperations: "Assisted Operations", orderInbox: "Order Inbox", deliveries: "Deliveries", inventory: "Inventory", replenishment: "Replenishment", creditClaims: "Credit & Claims", distributorOrders: "Distributor Orders", dispatch: "Dispatch", credit: "Credit", companyOrders: "Company Orders", controlCenter: "Control Center", masters: "Masters", network: "Network", audit: "Audit",
  salesExecutiveTitle: "Seera Sales Executive Portal", salesManagerTitle: "Seera Sales Manager Portal", distributorTitle: "Seera Distributor Portal", superStockistTitle: "Seera Super Stockist Portal", adminTitle: "Seera Admin Portal", accountsTitle: "Seera Accounts Portal", retailerTitle: "Seera Retailer Portal",
  salesExecutiveDashboard: "My delivered achievement and today's route", salesManagerDashboard: "Team field operations", distributorDashboard: "My distributor business", superStockistDashboard: "My super-stockist network", adminDashboard: "Company control and governed master data",
  myFieldDay: "My field day", teamAchievement: "Team achievement", retailerFulfilment: "Retailer fulfilment", distributorSupply: "Distributor supply", companyNetwork: "Company network",
  emptyState: "No records are available yet.", save: "Save", cancel: "Cancel", submit: "Submit", accept: "Accept", reject: "Reject", hold: "Hold", delivered: "Delivered", partialDelivered: "Partially delivered", pending: "Pending", active: "Active", inactive: "Inactive",
  stock: "Stock", stockAdjustment: "Stock adjustment", stockReconciliation: "Stock reconciliation", creditLimit: "Credit limit", creditDays: "Credit days", availableCredit: "Available credit", overdue: "Overdue", gracePeriod: "Grace period", promisedPaymentDate: "Promised payment date", originalDueDate: "Original due date", paymentProof: "Payment proof", orderStatus: "Order status", deliveryStatus: "Delivery status", physicalStock: "Physical stock", systemStock: "System stock", variance: "Variance",
  required: "This field is required.", invalidValue: "Enter a valid value.", genericError: "Something went wrong. Please try again.",
} as const;

const HI: Record<keyof typeof EN, string> = {
  protectedPortal: "सीरा सुरक्षित पोर्टल", authenticatedAs: "लॉग इन उपयोगकर्ता", language: "भाषा", english: "अंग्रेज़ी", hindi: "हिन्दी",
  unavailable: "पोर्टल अस्थायी रूप से उपलब्ध नहीं है", accessDenied: "प्रवेश अस्वीकृत", disabledMessage: "यह पोर्टल स्वीकृत सुविधा ध्वज द्वारा बंद है।", deniedMessage: "यह पोर्टल इस उपयोगकर्ता के लिए उपलब्ध नहीं है।", reserved: "यह नियंत्रित पोर्टल अपने निर्धारित रोडमैप चरण के लिए सुरक्षित है।",
  today: "आज", beatRoadmap: "आज का बीट मार्ग", retailers: "खुदरा विक्रेता", orders: "ऑर्डर", dsr: "दैनिक बिक्री रिपोर्ट", teamFieldwork: "टीम फील्ड कार्य", jointWorking: "संयुक्त कार्य", partnerDevelopment: "व्यापार भागीदार विकास", approvals: "अनुमोदन", assistedOperations: "सहायता प्राप्त संचालन", orderInbox: "ऑर्डर इनबॉक्स", deliveries: "डिलीवरी", inventory: "स्टॉक", replenishment: "पुनःपूर्ति", creditClaims: "क्रेडिट और दावे", distributorOrders: "वितरक ऑर्डर", dispatch: "प्रेषण", credit: "क्रेडिट", companyOrders: "कंपनी ऑर्डर", controlCenter: "नियंत्रण केंद्र", masters: "मास्टर डेटा", network: "बिक्री नेटवर्क", audit: "ऑडिट",
  salesExecutiveTitle: "सीरा बिक्री कार्यकारी पोर्टल", salesManagerTitle: "सीरा बिक्री प्रबंधक पोर्टल", distributorTitle: "सीरा वितरक पोर्टल", superStockistTitle: "सीरा सुपर स्टॉकिस्ट पोर्टल", adminTitle: "सीरा प्रशासन पोर्टल", accountsTitle: "सीरा लेखा पोर्टल", retailerTitle: "सीरा खुदरा विक्रेता पोर्टल",
  salesExecutiveDashboard: "मेरी डिलीवर की गई बिक्री उपलब्धि और आज का मार्ग", salesManagerDashboard: "टीम फील्ड संचालन", distributorDashboard: "मेरा वितरक व्यवसाय", superStockistDashboard: "मेरा सुपर स्टॉकिस्ट नेटवर्क", adminDashboard: "कंपनी नियंत्रण और नियंत्रित मास्टर डेटा",
  myFieldDay: "मेरा फील्ड दिवस", teamAchievement: "टीम उपलब्धि", retailerFulfilment: "खुदरा ऑर्डर पूर्ति", distributorSupply: "वितरक आपूर्ति", companyNetwork: "कंपनी नेटवर्क",
  emptyState: "अभी कोई रिकॉर्ड उपलब्ध नहीं है।", save: "सहेजें", cancel: "रद्द करें", submit: "जमा करें", accept: "स्वीकार करें", reject: "अस्वीकार करें", hold: "रोकें", delivered: "डिलीवर किया गया", partialDelivered: "आंशिक डिलीवरी", pending: "लंबित", active: "सक्रिय", inactive: "निष्क्रिय",
  stock: "स्टॉक", stockAdjustment: "स्टॉक समायोजन", stockReconciliation: "स्टॉक मिलान", creditLimit: "क्रेडिट सीमा", creditDays: "क्रेडिट अवधि", availableCredit: "उपलब्ध क्रेडिट", overdue: "अतिदेय", gracePeriod: "अनुग्रह अवधि", promisedPaymentDate: "वादा की गई भुगतान तिथि", originalDueDate: "मूल देय तिथि", paymentProof: "भुगतान प्रमाण", orderStatus: "ऑर्डर स्थिति", deliveryStatus: "डिलीवरी स्थिति", physicalStock: "भौतिक स्टॉक", systemStock: "सिस्टम स्टॉक", variance: "अंतर",
  required: "यह फ़ील्ड आवश्यक है।", invalidValue: "मान्य जानकारी दर्ज करें।", genericError: "कुछ गलत हुआ। कृपया पुनः प्रयास करें।",
};

export const UI_MESSAGES = { EN, HI } as const;
export type TranslationKey = keyof typeof EN;
export function normalizeLanguage(value: unknown): UiLanguage { return value === "HI" ? "HI" : "EN"; }
export function translate(language: UiLanguage, key: TranslationKey): string { return UI_MESSAGES[language]?.[key] ?? UI_MESSAGES.EN[key]; }

const portalKeys = {
  "founder-admin": { title: "adminTitle", dashboard: "adminDashboard", terminology: "companyNetwork", navigation: ["controlCenter", "masters", "network", "approvals", "audit"] },
  "sales-manager": { title: "salesManagerTitle", dashboard: "salesManagerDashboard", terminology: "teamAchievement", navigation: ["teamFieldwork", "jointWorking", "partnerDevelopment", "approvals", "assistedOperations"] },
  "sales-executive": { title: "salesExecutiveTitle", dashboard: "salesExecutiveDashboard", terminology: "myFieldDay", navigation: ["today", "beatRoadmap", "retailers", "orders", "dsr"] },
  distributor: { title: "distributorTitle", dashboard: "distributorDashboard", terminology: "retailerFulfilment", navigation: ["orderInbox", "deliveries", "inventory", "replenishment", "creditClaims"] },
  "super-stockist": { title: "superStockistTitle", dashboard: "superStockistDashboard", terminology: "distributorSupply", navigation: ["distributorOrders", "dispatch", "inventory", "credit", "companyOrders"] },
} as const;

export type BilingualPortal = keyof typeof portalKeys;
export function localizedPortal(language: UiLanguage, portal: BilingualPortal) { const definition = portalKeys[portal]; return { title: translate(language, definition.title), dashboard: translate(language, definition.dashboard), terminology: translate(language, definition.terminology), navigation: definition.navigation.map((key) => translate(language, key)) }; }

export function localizedStatus(language: UiLanguage, canonicalCode: string): string {
  const keys: Record<string, TranslationKey> = { PENDING: "pending", ACTIVE: "active", INACTIVE: "inactive", DELIVERED: "delivered", PARTIAL_DELIVERED: "partialDelivered" };
  const key = keys[canonicalCode]; return key ? translate(language, key) : canonicalCode;
}
