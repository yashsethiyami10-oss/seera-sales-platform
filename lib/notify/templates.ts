/**
 * Email HTML is intentionally simple table/div markup with inline styles —
 * email clients (Outlook especially) don't reliably support external
 * stylesheets, web fonts, or flexbox/grid, so this doesn't try to replicate
 * the storefront's Fraunces/Tailwind styling. The brand shows up through
 * the lavender accent color and consistent structure, not the exact same
 * CSS as the website.
 */

const LAVENDER = "#B7ABF0";
const INK = "#0b0b0f";

function wrapper(bodyHtml: string) {
  return `
  <div style="background:${INK};padding:40px 20px;font-family:Georgia,serif;">
    <div style="max-width:480px;margin:0 auto;background:#111117;border-radius:16px;padding:32px;border:1px solid rgba(255,255,255,0.08);">
      <p style="color:#fff;font-size:22px;margin:0 0 24px;">Muv<span style="color:${LAVENDER};font-size:11px;vertical-align:super;">™</span></p>
      ${bodyHtml}
      <p style="color:rgba(255,255,255,0.3);font-size:11px;margin-top:32px;font-family:Arial,sans-serif;">Muv — Keep Muving. This is a transactional email regarding your order.</p>
    </div>
  </div>`;
}

function paragraph(text: string) {
  return `<p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;font-family:Arial,sans-serif;margin:0 0 16px;">${text}</p>`;
}

function button(label: string, url: string) {
  return `<a href="${url}" style="display:inline-block;background:#fff;color:${INK};padding:12px 24px;border-radius:999px;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;margin:8px 0 8px;">${label}</a>`;
}

export function orderConfirmationEmail(data: { orderNumber: string; customerName: string; total: number; items: { name: string; size: string; quantity: number }[] }) {
  const itemsHtml = data.items
    .map((i) => `<p style="color:rgba(255,255,255,0.6);font-size:13px;font-family:Arial,sans-serif;margin:0 0 6px;">${i.name} (${i.size}) × ${i.quantity}</p>`)
    .join("");
  return {
    subject: `Order Confirmed — #${data.orderNumber}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Thank you, ${data.customerName}.</h1>
      ${paragraph("Your Muv order is being carefully prepared. We'll keep you updated every step of the way.")}
      <p style="color:#B7ABF0;font-size:15px;font-weight:bold;letter-spacing:1px;font-family:Arial,sans-serif;margin:20px 0 16px;">Keep Muving™</p>
      <div style="margin:16px 0;">${itemsHtml}</div>
      <p style="color:#fff;font-size:16px;font-family:Arial,sans-serif;margin:16px 0;">Total: ₹${data.total}</p>
      ${button("Track Your Order", `${process.env.NEXT_PUBLIC_SITE_URL}/account/orders`)}
    `),
  };
}

export function shippingConfirmationEmail(data: { orderNumber: string; customerName: string; awbNumber: string; trackingUrl: string; courierName?: string }) {
  return {
    subject: `Your Muv order has shipped — #${data.orderNumber}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">On Its Way</h1>
      ${paragraph(`Hi ${data.customerName}, your order #${data.orderNumber} has shipped${data.courierName ? ` via ${data.courierName}` : ""}.`)}
      ${paragraph(`Tracking number: <strong style="color:#fff;">${data.awbNumber}</strong>`)}
      ${button("Track Shipment", data.trackingUrl)}
    `),
  };
}

export function deliveryConfirmationEmail(data: { orderNumber: string; customerName: string }) {
  return {
    subject: `Delivered — #${data.orderNumber}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Delivered</h1>
      ${paragraph(`Hi ${data.customerName}, order #${data.orderNumber} has been delivered. We hope you love it.`)}
      ${button("Write a Review", `${process.env.NEXT_PUBLIC_SITE_URL}/account/orders`)}
    `),
  };
}

export function orderCancelledEmail(data: { orderNumber: string; customerName: string; reason?: string }) {
  return {
    subject: `Order Cancelled — #${data.orderNumber}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Order Cancelled</h1>
      ${paragraph(`Hi ${data.customerName}, order #${data.orderNumber} has been cancelled${data.reason ? `: ${data.reason}` : "."}`)}
      ${paragraph("If you paid online, a refund will follow separately.")}
    `),
  };
}

export function refundProcessedEmail(data: { orderNumber: string; customerName: string; amount: number }) {
  return {
    subject: `Refund Processed — #${data.orderNumber}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Refund Processed</h1>
      ${paragraph(`Hi ${data.customerName}, ₹${data.amount} has been refunded for order #${data.orderNumber}. It should reflect in 5-7 business days depending on your bank.`)}
    `),
  };
}

export function welcomeEmail(data: { customerName: string }) {
  return {
    subject: "Welcome to Muv",
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Welcome, ${data.customerName}</h1>
      ${paragraph("Keep Muving — home, fabric, body, personal and car care, all held to one premium standard.")}
      ${button("Start Shopping", `${process.env.NEXT_PUBLIC_SITE_URL}/shop`)}
    `),
  };
}

export function passwordResetEmail(data: { resetUrl: string }) {
  return {
    subject: "Reset your Muv password",
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Reset Your Password</h1>
      ${paragraph("Click below to set a new password. This link expires in 1 hour — if you didn't request this, you can ignore this email.")}
      ${button("Reset Password", data.resetUrl)}
    `),
  };
}

// Phase 18 — the one real gap in an otherwise fully-wired customer email
// sequence (Confirmed → Processing → Shipped → Delivered): nothing fired
// between "confirmed" and "shipped". Same real trigger point as shipping/
// delivery — fired when an admin moves a real order to PACKED.
export function orderProcessingEmail(data: { orderNumber: string; customerName: string }) {
  return {
    subject: `Your order is being prepared — #${data.orderNumber}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Being Prepared</h1>
      ${paragraph(`Hi ${data.customerName}, order #${data.orderNumber} is being packed and will ship soon.`)}
      ${button("Track Your Order", `${process.env.NEXT_PUBLIC_SITE_URL}/account/orders`)}
    `),
  };
}

// ---------------------------------------------------------------------------
// Admin/staff alerts (Phase 18) — same wrapper/paragraph/button building
// blocks as every customer email above, addressed to whichever email
// StoreSettings.adminNotificationEmail is configured with, only sent when
// its matching toggle is on (see lib/notify/send.ts's admin-alert
// functions — that's where the real on/off check lives).
// ---------------------------------------------------------------------------

export function adminNewOrderEmail(data: { orderNumber: string; customerName: string; total: number; paymentMethod: string }) {
  return {
    subject: `New order — #${data.orderNumber} (₹${data.total})`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">New Order</h1>
      ${paragraph(`${data.customerName} placed order #${data.orderNumber} for ₹${data.total} (${data.paymentMethod}).`)}
      ${button("View in Admin", `${process.env.NEXT_PUBLIC_SITE_URL}/admin/orders`)}
    `),
  };
}

export function adminFailedPaymentEmail(data: { orderNumber: string; customerName: string; reason: string }) {
  return {
    subject: `Payment failed — #${data.orderNumber}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Payment Failed</h1>
      ${paragraph(`${data.customerName}'s payment for order #${data.orderNumber} failed: ${data.reason}`)}
      ${button("View in Admin", `${process.env.NEXT_PUBLIC_SITE_URL}/admin/orders`)}
    `),
  };
}

export function adminNewInquiryEmail(data: { name: string; businessType: string; email: string }) {
  return {
    subject: `New business inquiry — ${data.name}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">New Business Inquiry</h1>
      ${paragraph(`${data.name} (${data.businessType}) submitted an enquiry — ${data.email}`)}
    `),
  };
}

export function adminNewReviewEmail(data: { productName: string; customerName: string; rating: number }) {
  return {
    subject: `New review pending — ${data.productName}`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">New Review to Moderate</h1>
      ${paragraph(`${data.customerName} left a ${data.rating}-star review on ${data.productName}, awaiting approval.`)}
    `),
  };
}

export function adminLowStockEmail(data: { productName: string; size: string; quantity: number }) {
  return {
    subject: `Low stock — ${data.productName} (${data.size})`,
    html: wrapper(`
      <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Low Stock</h1>
      ${paragraph(`${data.productName} (${data.size}) is down to ${data.quantity} unit${data.quantity === 1 ? "" : "s"}.`)}
      ${button("View Inventory", `${process.env.NEXT_PUBLIC_SITE_URL}/admin/inventory`)}
    `),
  };
}
