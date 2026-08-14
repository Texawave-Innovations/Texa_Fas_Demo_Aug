# Fluoro ERP Pvt Ltd

A complete, modern ERP frontend built with React, TypeScript, Tailwind CSS, Firebase Realtime Database, and Cloudinary.

## Features

### ✅ Complete Sales Module
- **Customer Management** - Add, edit, delete, and search customers with complete details (GST, PAN, addresses, bank details)
- **Product Management** - Manage product catalog with SKU, HSN, pricing, tax, and stock tracking
- **Lead Management** - Track sales opportunities with status workflow (New → Contacted → Qualified → Converted/Lost)
- **Quotation Builder** - Create detailed quotations with line items, discounts, taxes, and file attachments
- **Order Acknowledgements** - Convert quotations to confirmed orders
- **Sales Invoices** - Generate invoices with payment tracking (Paid/Unpaid/Partial)
- **Sales Reports** - Analytics and CSV export capabilities

### 🔐 Role-Based Access Control
- **Admin** - Full access to all modules
- **Sales** - Sales module only
- **HR** - HR module only
- **Accountant** - Finance module only
- **Manager** - Projects, Employees, Attendance modules

### 🎨 Modern UI
- Clean, professional design with purple accent theme
- Fully responsive (mobile, tablet, desktop)
- Smooth animations and transitions
- Beautiful dashboard with stat cards
- Collapsible sidebar navigation

### 🚀 Tech Stack
- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS + Shadcn UI components
- **Database**: Firebase Realtime Database
- **File Upload**: Cloudinary (images & PDFs)
- **Routing**: React Router v6
- **State Management**: React Context API

## Demo Credentials

| Username | Password | Access Level |
|----------|----------|--------------|
| admin | admin123 | All modules |
| sales | sales123 | Sales only |
| hr | hr123 | HR only |
| accounts | accounts123 | Finance only |
| manager | manager123 | Projects, Employees, Attendance |

## Project Structure

```
src/
├── components/
│   ├── layout/          # Sidebar, Topbar, Layout
│   ├── ui/              # Shadcn UI components
│   └── ProtectedRoute.tsx
├── context/
│   └── AuthContext.tsx  # Authentication & RBAC
├── modules/
│   └── sales/           # Complete Sales module
│       ├── Customers.tsx
│       ├── Products.tsx
│       ├── Leads.tsx
│       ├── Quotations.tsx
│       ├── CreateQuotation.tsx
│       ├── Orders.tsx
│       ├── Invoices.tsx
│       ├── Reports.tsx
│       └── SalesLayout.tsx
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── StubPage.tsx     # For modules under development
│   ├── AccessDenied.tsx
│   └── NotFound.tsx
├── services/
│   ├── firebase.ts      # Firebase CRUD operations
│   └── cloudinary.ts    # File upload service
├── types/
│   └── index.ts         # TypeScript interfaces
└── App.tsx              # Main routing
```

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```

3. **Login** with any demo credentials above

4. **Explore the Sales module** - Fully functional!

## Firebase Configuration

The app uses the following Firebase configuration:
```javascript
{
  apiKey: "AIzaSyBlYRmC04NUje53nm1Nt9t8Rg9945DlFnA",
  authDomain: "fluro-92c1c.firebaseapp.com",
  databaseURL: "https://fluro-92c1c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "fluro-92c1c",
  storageBucket: "fluro-92c1c.firebasestorage.app",
  messagingSenderId: "316975869540",
  appId: "1:316975869540:web:19247d407fa07b7968b971"
}
```

## Cloudinary Configuration

File uploads use:
- **Cloud Name**: dpgf1rkjl
- **Upload Preset**: unsigned_preset
- **Image Upload**: `https://api.cloudinary.com/v1_1/dpgf1rkjl/image/upload`
- **PDF/Raw Upload**: `https://api.cloudinary.com/v1_1/dpgf1rkjl/raw/upload`

## Database Structure

```
/sales
  /customers
    /{customerId}
      - companyName, contactPerson, email, phone, gst, pan, addresses, bankDetails
  /products
    /{productId}
      - name, sku, hsn, unitPrice, taxPercent, stockQty
  /leads
    /{leadId}
      - customerId, source, status, expectedValue, expectedCloseDate, assignedTo
  /quotations
    /{quotationId}
      - quoteNumber, customerId, lineItems[], subtotal, taxTotal, grandTotal, status
  /orderAcknowledgements
    /{orderId}
      - soNumber, quotationId, lineItems[], gstAmount, grandTotal, status
  /invoices
    /{invoiceId}
      - invoiceNumber, customerId, invoiceAmount, paymentStatus, paidAmount
```

## Modules Status

| Module | Status |
|--------|--------|
| Dashboard | ✅ Complete |
| Sales | ✅ Complete (Full CRUD, Quotations, Orders, Invoices, Reports) |
| Projects | 🚧 UI Stub |
| HR | 🚧 UI Stub |
| Employees | 🚧 UI Stub |
| Attendance | 🚧 UI Stub |
| Finance | 🚧 UI Stub |
| Payroll | 🚧 UI Stub |
| Materials | 🚧 UI Stub |
| Documents | 🚧 UI Stub |
| Reports | 🚧 UI Stub |
| Settings | 🚧 UI Stub |

## Key Features Implemented

### Sales Module
- ✅ Full CRUD operations for Customers & Products
- ✅ Lead tracking with status workflow
- ✅ Multi-line quotation builder with:
  - Dynamic line items
  - Automatic calculations (discount, tax, totals)
  - File attachments (Cloudinary)
  - Customer GST/PAN integration
- ✅ Order acknowledgement workflow
- ✅ Invoice generation with payment tracking
- ✅ Sales reports and analytics
- ✅ CSV export capability

### Authentication & Security
- ✅ Static role-based authentication
- ✅ Protected routes with access control
- ✅ Automatic redirects for unauthorized access
- ✅ Session persistence with localStorage

### UI/UX
- ✅ Modern purple-themed design
- ✅ Responsive sidebar with collapse
- ✅ Search functionality across all lists
- ✅ Toast notifications for user feedback
- ✅ Loading states and error handling
- ✅ Accessible form validation

## Future Enhancements

1. **PDF Generation** - Client-side PDF export for quotations and invoices
2. **Email Integration** - Send quotations via email
3. **Advanced Reports** - Charts and graphs for sales analytics
4. **Complete Other Modules** - Projects, HR, Finance, etc.
5. **Real-time Updates** - Firebase listeners for live data sync
6. **Audit Logs** - Track all changes and user actions
7. **Advanced RBAC** - Permission-level control beyond module access

## Support

For questions or issues, contact Fluoro ERP Pvt Ltd support team.

---

**Built with ❤️ using React + TypeScript + Tailwind CSS**
