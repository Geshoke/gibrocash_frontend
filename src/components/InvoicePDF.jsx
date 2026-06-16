import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 40,
    color: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  companyBlock: {
    flexDirection: 'column',
  },
  companyName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  companyMeta: {
    fontSize: 8,
    color: '#555',
    lineHeight: 1.5,
  },
  logoPlaceholder: {
    width: 120,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#1565c0',
  },
  logoSub: {
    fontSize: 7,
    color: '#1565c0',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1565c0',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  billBlock: {
    width: '55%',
  },
  billLabel: {
    fontSize: 7,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  billName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  billDetail: {
    fontSize: 8,
    color: '#555',
  },
  infoBlock: {
    width: '40%',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  infoLabel: {
    fontSize: 7,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: '45%',
  },
  infoValue: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    width: '55%',
    textAlign: 'right',
  },
  table: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  colItem: { width: '22%' },
  colDesc: { width: '28%' },
  colTax: { width: '10%', textAlign: 'center' },
  colQty: { width: '10%', textAlign: 'right' },
  colRate: { width: '15%', textAlign: 'right' },
  colAmount: { width: '15%', textAlign: 'right' },
  thText: {
    fontSize: 7,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Helvetica-Bold',
  },
  tdText: {
    fontSize: 8,
    color: '#333',
  },
  tdBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
  },
  tdDesc: {
    fontSize: 7,
    color: '#666',
  },
  totalsSection: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  totalsBox: {
    width: '40%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  totalLabel: {
    fontSize: 8,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 8,
    color: '#333',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: '#333',
  },
  balanceLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1565c0',
  },
  taxSummarySection: {
    marginTop: 24,
  },
  taxSummaryTitle: {
    fontSize: 7,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  taxSummaryHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  taxSummaryRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  taxCol: { width: '33.33%' },
  taxColRight: { width: '33.33%', textAlign: 'right' },
  notes: {
    marginTop: 20,
    padding: 8,
    backgroundColor: '#fafafa',
    borderRadius: 4,
  },
  notesLabel: {
    fontSize: 7,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 8,
    color: '#555',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: '#bbb',
    borderTopWidth: 0.5,
    borderTopColor: '#eee',
    paddingTop: 6,
  },
});

const fmt = (n) =>
  new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const InvoicePDF = ({ invoice }) => {
  if (!invoice) return null;

  const items = invoice.invoice_items || [];
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const taxRate = items[0]?.tax_rate ?? 16;
  const tax = parseFloat((subtotal * taxRate / (100 + taxRate)).toFixed(2));
  const total = subtotal;
  const net = subtotal - tax;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>GIBRO Enterprise LTD</Text>
            <Text style={styles.companyMeta}>Likoni Road{'\n'}NAIROBI, NAIROBI 00100 KE{'\n'}+254710341246{'\n'}info@gibroenterprise.co.ke{'\n'}PIN P051595908Z</Text>
          </View>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>GIBRO</Text>
            <Text style={styles.logoSub}>ENTERPRISE LTD</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Tax Invoice</Text>

        {/* Bill To + Invoice Meta */}
        <View style={styles.metaRow}>
          <View style={styles.billBlock}>
            <Text style={styles.billLabel}>Bill To</Text>
            <Text style={styles.billName}>{invoice.client_name}</Text>
            {invoice.client_agent ? <Text style={styles.billDetail}>{invoice.client_agent}</Text> : null}
            {invoice.client_pin ? <Text style={styles.billDetail}>{invoice.client_pin}</Text> : null}
            {invoice.project ? <Text style={styles.billDetail}>Project: {invoice.project.name}</Text> : null}
          </View>
          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Invoice</Text>
              <Text style={styles.infoValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{fmtDate(invoice.date)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Terms</Text>
              <Text style={styles.infoValue}>{invoice.terms}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Due Date</Text>
              <Text style={styles.infoValue}>{fmtDate(invoice.due_date)}</Text>
            </View>
          </View>
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, styles.colItem]}>Item</Text>
            <Text style={[styles.thText, styles.colDesc]}>Description</Text>
            <Text style={[styles.thText, styles.colTax]}>Tax</Text>
            <Text style={[styles.thText, styles.colQty]}>Qty</Text>
            <Text style={[styles.thText, styles.colRate]}>Rate</Text>
            <Text style={[styles.thText, styles.colAmount]}>Amount</Text>
          </View>

          {items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tdBold, styles.colItem]}>{item.item_name}</Text>
              <Text style={[styles.tdDesc, styles.colDesc]}>{item.description || ''}</Text>
              <Text style={[styles.tdText, styles.colTax]}>{item.tax_type}</Text>
              <Text style={[styles.tdText, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.tdText, styles.colRate]}>{fmt(item.rate)}</Text>
              <Text style={[styles.tdText, styles.colAmount]}>{fmt(item.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmt(net)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({taxRate}%)</Text>
              <Text style={styles.totalValue}>{fmt(tax)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{fmt(total)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Balance Due</Text>
              <Text style={styles.balanceValue}>Ksh {fmt(total)}</Text>
            </View>
          </View>
        </View>

        {/* Tax Summary */}
        <View style={styles.taxSummarySection}>
          <Text style={styles.taxSummaryTitle}>Tax Summary</Text>
          <View style={styles.taxSummaryHeader}>
            <Text style={[styles.thText, styles.taxCol]}>Rate</Text>
            <Text style={[styles.thText, styles.taxColRight]}>Tax</Text>
            <Text style={[styles.thText, styles.taxColRight]}>Net</Text>
          </View>
          <View style={styles.taxSummaryRow}>
            <Text style={[styles.tdText, styles.taxCol]}>KRA @ {taxRate}%</Text>
            <Text style={[styles.tdText, styles.taxColRight]}>{fmt(tax)}</Text>
            <Text style={[styles.tdText, styles.taxColRight]}>{fmt(net)}</Text>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <Text style={styles.footer}>Page 1 of 1</Text>
      </Page>
    </Document>
  );
};

export default InvoicePDF;
