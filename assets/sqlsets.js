/* NSSqlSets: ready query sets for programs that keep their books in a database NSBiz for Windows can read (ExtSql.cs in the program:
   SQL Server, or ODBC for MySQL / MariaDB / PostgreSQL). Each query gives its columns the NSBiz template's own headings (tplcore.js),
   so the rows go through the same reader, preview and balance check as an Excel file. Read only: the program runs one SELECT at a time
   inside a transaction it always rolls back.
   The table and column names are those the programs publish (SAP Business One's documented tables, ERPNext's DocTypes, Odoo 16 / 17's
   models). They have not been tried on a real company of each program yet: the screen says so, and any query that fails shows the
   program's own message; "Pick a table" then works for anything.
   Designed & Developed by: Nivesh Sahayak (https://www.niveshsahayak.in/) */
(function (G) {
  'use strict';
  var SETS = [
    { id: 'sapb1', name: 'SAP Business One', kind: 'sqlserver', note: 'SQL Server edition. Choose the company database (the one named after the company, not SBO-COMMON).',
      sheets: {
        'Parties': "SELECT T0.CardName AS [Name], CASE T0.CardType WHEN 'S' THEN 'Supplier' ELSE 'Customer' END AS [Customer or supplier], G.GroupName AS [Group], T0.LicTradNum AS [GSTIN], " +
          "T0.Address AS [Address], T0.City AS [City], T0.ZipCode AS [PIN code], T0.Phone1 AS [Phone], T0.E_Mail AS [Email] FROM OCRD T0 LEFT JOIN OCRG G ON G.GroupCode = T0.GroupCode WHERE T0.CardType IN ('C', 'S')",
        'Items': "SELECT T0.ItemName AS [Item name], CASE T0.ItemType WHEN 'I' THEN 'Goods' ELSE 'Service' END AS [Goods or service], T0.InvntryUom AS [Unit] FROM OITM T0",
        'Sales bills': "SELECT CAST(T0.DocNum AS varchar(20)) AS [Bill no], T0.DocDate AS [Date], T0.CardName AS [Party], T1.Dscription AS [Item], T1.Quantity AS [Qty], T1.unitMsr AS [Unit], " +
          "T1.PriceBefDi AS [Rate], T1.DiscPrcnt AS [Discount %], T1.VatPrcnt AS [GST %], 'Tax invoice' AS [Kind], '' AS [Against bill no], T0.DocTotal AS [Bill total], T0.Comments AS [Narration] " +
          "FROM OINV T0 JOIN INV1 T1 ON T1.DocEntry = T0.DocEntry WHERE T0.CANCELED = 'N' " +
          "UNION ALL SELECT CAST(T0.DocNum AS varchar(20)), T0.DocDate, T0.CardName, T1.Dscription, T1.Quantity, T1.unitMsr, T1.PriceBefDi, T1.DiscPrcnt, T1.VatPrcnt, 'Credit note', '', T0.DocTotal, T0.Comments " +
          "FROM ORIN T0 JOIN RIN1 T1 ON T1.DocEntry = T0.DocEntry WHERE T0.CANCELED = 'N' ORDER BY [Date], [Bill no]",
        'Purchase bills': "SELECT COALESCE(NULLIF(T0.NumAtCard, ''), CAST(T0.DocNum AS varchar(20))) AS [Supplier bill no], T0.DocDate AS [Date], T0.CardName AS [Supplier], T1.Dscription AS [Item], " +
          "T1.Quantity AS [Qty], T1.unitMsr AS [Unit], T1.PriceBefDi AS [Rate], T1.DiscPrcnt AS [Discount %], T1.VatPrcnt AS [GST %], 'Purchase' AS [Kind], CAST(T0.DocNum AS varchar(20)) AS [Our entry no], " +
          "T0.DocTotal AS [Bill total], T0.Comments AS [Narration] FROM OPCH T0 JOIN PCH1 T1 ON T1.DocEntry = T0.DocEntry WHERE T0.CANCELED = 'N' " +
          "UNION ALL SELECT COALESCE(NULLIF(T0.NumAtCard, ''), CAST(T0.DocNum AS varchar(20))), T0.DocDate, T0.CardName, T1.Dscription, T1.Quantity, T1.unitMsr, T1.PriceBefDi, T1.DiscPrcnt, T1.VatPrcnt, 'Return', " +
          "CAST(T0.DocNum AS varchar(20)), T0.DocTotal, T0.Comments FROM ORPC T0 JOIN RPC1 T1 ON T1.DocEntry = T0.DocEntry WHERE T0.CANCELED = 'N' ORDER BY [Date], [Supplier bill no]",
        'Receipts and payments': "SELECT T0.DocDate AS [Date], 'Received' AS [Received or paid], T0.CardName AS [Party], T0.DocTotal AS [Amount], CASE WHEN T0.CashSum > 0 THEN 'Cash' ELSE 'Bank' END AS [Mode], " +
          "CAST(T0.DocNum AS varchar(20)) AS [Cheque or reference no], T0.Comments AS [Narration] FROM ORCT T0 WHERE T0.Canceled = 'N' AND T0.DocType IN ('C', 'S') " +
          "UNION ALL SELECT T0.DocDate, 'Paid', T0.CardName, T0.DocTotal, CASE WHEN T0.CashSum > 0 THEN 'Cash' ELSE 'Bank' END, CAST(T0.DocNum AS varchar(20)), T0.Comments " +
          "FROM OVPM T0 WHERE T0.Canceled = 'N' AND T0.DocType IN ('C', 'S') ORDER BY [Date]"
      } },
    { id: 'erpnext', name: 'ERPNext', kind: 'odbc', note: 'MariaDB / MySQL through its ODBC driver (MySQL Connector/ODBC or MariaDB Connector/ODBC). Choose the site\'s database.',
      sheets: {
        'Parties': "SELECT customer_name AS `Name`, 'Customer' AS `Customer or supplier`, customer_group AS `Group` FROM `tabCustomer` WHERE disabled = 0 " +
          "UNION ALL SELECT supplier_name, 'Supplier', supplier_group FROM `tabSupplier` WHERE disabled = 0",
        'Items': "SELECT item_name AS `Item name`, CASE WHEN is_stock_item = 1 THEN 'Goods' ELSE 'Service' END AS `Goods or service`, stock_uom AS `Unit` FROM `tabItem` WHERE disabled = 0",
        'Sales bills': "SELECT si.name AS `Bill no`, si.posting_date AS `Date`, si.customer_name AS `Party`, it.item_name AS `Item`, it.qty AS `Qty`, it.uom AS `Unit`, it.net_rate AS `Rate`, " +
          "ROUND(si.total_taxes_and_charges * 100 / NULLIF(si.net_total, 0), 2) AS `GST %`, CASE WHEN si.is_return = 1 THEN 'Credit note' ELSE 'Tax invoice' END AS `Kind`, si.return_against AS `Against bill no`, " +
          "si.grand_total AS `Bill total`, si.remarks AS `Narration` FROM `tabSales Invoice` si JOIN `tabSales Invoice Item` it ON it.parent = si.name WHERE si.docstatus = 1 ORDER BY si.posting_date, si.name, it.idx",
        'Purchase bills': "SELECT COALESCE(NULLIF(pi.bill_no, ''), pi.name) AS `Supplier bill no`, pi.posting_date AS `Date`, pi.supplier_name AS `Supplier`, it.item_name AS `Item`, it.qty AS `Qty`, it.uom AS `Unit`, " +
          "it.net_rate AS `Rate`, ROUND(pi.total_taxes_and_charges * 100 / NULLIF(pi.net_total, 0), 2) AS `GST %`, CASE WHEN pi.is_return = 1 THEN 'Return' ELSE 'Purchase' END AS `Kind`, pi.return_against AS `Against bill no`, " +
          "pi.name AS `Our entry no`, pi.grand_total AS `Bill total`, pi.remarks AS `Narration` FROM `tabPurchase Invoice` pi JOIN `tabPurchase Invoice Item` it ON it.parent = pi.name WHERE pi.docstatus = 1 ORDER BY pi.posting_date, pi.name, it.idx",
        'Receipts and payments': "SELECT posting_date AS `Date`, CASE payment_type WHEN 'Receive' THEN 'Received' ELSE 'Paid' END AS `Received or paid`, party_name AS `Party`, paid_amount AS `Amount`, " +
          "mode_of_payment AS `Mode`, reference_no AS `Cheque or reference no`, remarks AS `Narration` FROM `tabPayment Entry` WHERE docstatus = 1 AND payment_type IN ('Receive', 'Pay') AND party_type IN ('Customer', 'Supplier') ORDER BY posting_date"
      } },
    { id: 'odoo', name: 'Odoo 16 or 17', kind: 'odbc', note: 'PostgreSQL through the psqlODBC driver. Choose the Odoo database.',
      sheets: {
        'Parties': "SELECT p.name AS \"Name\", CASE WHEN p.supplier_rank > 0 AND p.customer_rank > 0 THEN 'Both' WHEN p.supplier_rank > 0 THEN 'Supplier' ELSE 'Customer' END AS \"Customer or supplier\", " +
          "p.vat AS \"GSTIN\", p.street AS \"Address\", p.city AS \"City\", p.zip AS \"PIN code\", p.phone AS \"Phone\", p.email AS \"Email\" FROM res_partner p " +
          "WHERE p.active AND p.parent_id IS NULL AND (p.customer_rank > 0 OR p.supplier_rank > 0)",
        'Items': "SELECT t.name->>'en_US' AS \"Item name\", CASE t.detailed_type WHEN 'service' THEN 'Service' ELSE 'Goods' END AS \"Goods or service\" FROM product_template t WHERE t.active",
        'Sales bills': "SELECT m.name AS \"Bill no\", m.invoice_date AS \"Date\", p.name AS \"Party\", l.name AS \"Item\", l.quantity AS \"Qty\", l.price_unit AS \"Rate\", l.discount AS \"Discount %\", " +
          "ROUND(m.amount_tax * 100 / NULLIF(m.amount_untaxed, 0), 2) AS \"GST %\", CASE m.move_type WHEN 'out_refund' THEN 'Credit note' ELSE 'Tax invoice' END AS \"Kind\", m.amount_total AS \"Bill total\" " +
          "FROM account_move m JOIN account_move_line l ON l.move_id = m.id AND l.display_type = 'product' JOIN res_partner p ON p.id = m.partner_id " +
          "WHERE m.state = 'posted' AND m.move_type IN ('out_invoice', 'out_refund') ORDER BY m.invoice_date, m.name, l.sequence",
        'Purchase bills': "SELECT COALESCE(NULLIF(m.ref, ''), m.name) AS \"Supplier bill no\", m.invoice_date AS \"Date\", p.name AS \"Supplier\", l.name AS \"Item\", l.quantity AS \"Qty\", l.price_unit AS \"Rate\", " +
          "l.discount AS \"Discount %\", ROUND(m.amount_tax * 100 / NULLIF(m.amount_untaxed, 0), 2) AS \"GST %\", CASE m.move_type WHEN 'in_refund' THEN 'Return' ELSE 'Purchase' END AS \"Kind\", m.name AS \"Our entry no\", " +
          "m.amount_total AS \"Bill total\" FROM account_move m JOIN account_move_line l ON l.move_id = m.id AND l.display_type = 'product' JOIN res_partner p ON p.id = m.partner_id " +
          "WHERE m.state = 'posted' AND m.move_type IN ('in_invoice', 'in_refund') ORDER BY m.invoice_date, m.name, l.sequence",
        'Receipts and payments': "SELECT m.date AS \"Date\", CASE pay.payment_type WHEN 'inbound' THEN 'Received' ELSE 'Paid' END AS \"Received or paid\", p.name AS \"Party\", pay.amount AS \"Amount\", " +
          "'Bank' AS \"Mode\", m.name AS \"Cheque or reference no\" FROM account_payment pay JOIN account_move m ON m.id = pay.move_id JOIN res_partner p ON p.id = pay.partner_id WHERE m.state = 'posted' ORDER BY m.date"
      } }
  ];
  var API = { SETS: SETS, byId: function (id) { return SETS.filter(function (s) { return s.id === id; })[0] || null; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSSqlSets = API;
})(typeof window !== 'undefined' ? window : this);
