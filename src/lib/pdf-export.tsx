import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { DocumentView } from './api/documents';
import { getTopLevelBrickIds, resolveNestedBricks } from './bricks/nesting';

// Estilos para el PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 12,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },
  pageHarvard: {
    padding: 72, // 1 inch
    fontSize: 12,
    fontFamily: 'Times-Roman',
    lineHeight: 1.5,
  },
  watermark: {
    position: 'absolute',
    top: '42%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(-18deg)',
    fontSize: 54,
    fontWeight: 'bold',
    letterSpacing: 10,
    color: '#0f172a',
    opacity: 0.06,
  },
  block: {
    marginBottom: 14,
  },
  blockCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  blockMuted: {
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  h1: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
    textAlign: 'center',
  },
  h2: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  h3: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 6,
    textAlign: 'center',
  },
  paragraph: {
    marginBottom: 10,
    textIndent: 36, // 0.5 inch for Harvard
  },
  paragraphCarta: {
    marginBottom: 10,
    textIndent: 0,
  },
  quote: {
    marginBottom: 10,
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#d1d5db',
    color: '#374151',
  },
  callout: {
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    backgroundColor: '#fffbeb',
  },
  codeBlock: {
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#111827',
    color: '#f9fafb',
    fontFamily: 'Courier',
    fontSize: 9,
  },
  divider: {
    marginVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  mediaCard: {
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  mediaTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  mediaCaption: {
    marginTop: 4,
    fontSize: 10,
    color: '#6b7280',
  },
  containerCard: {
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  containerTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#111827',
  },
  containerLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#6b7280',
    marginBottom: 6,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  column: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#ffffff',
  },
  tabSection: {
    marginBottom: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    color: '#374151',
  },
  list: {
    marginLeft: 20,
    marginBottom: 10,
  },
  listItem: {
    marginBottom: 5,
    flexDirection: 'row',
  },
  listBullet: {
    width: 15,
  },
  table: {
    width: '100%',
    marginTop: 10,
    marginBottom: 10,
    border: '1px solid #ddd',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1px solid #ddd',
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
    fontWeight: 'bold',
  },
  tableCell: {
    flex: 1,
    padding: 8,
    borderRight: '1px solid #ddd',
    fontSize: 10,
  },
  exportDate: {
    fontSize: 9,
    color: '#666',
    marginBottom: 15,
    textAlign: 'right',
    borderBottom: '1px solid #eee',
    paddingBottom: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 9,
    color: '#aaa',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

interface PDFDocumentProps {
  document: DocumentView;
  style: 'carta' | 'harvard';
  paperSize: 'letter' | 'A4';
  exportDate: string;
}

const PDFDocument: React.FC<PDFDocumentProps> = ({ document, style, paperSize, exportDate }) => {
  const isHarvard = style === 'harvard';
  const pageStyle = isHarvard ? styles.pageHarvard : styles.page;
  const paragraphStyle = isHarvard ? styles.paragraph : styles.paragraphCarta;
  const topLevelBricks = [...document.bricks]
    .filter((brick) => getTopLevelBrickIds(document.bricks).has(brick.id))
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  const renderNestedBricks = (content: Record<string, any>, containerId: string) => {
    const nested = resolveNestedBricks(content, containerId, document.bricks as any[]);
    if (nested.length === 0) return null;

    return (
      <View style={{ marginTop: 8 }}>
        {nested.map((brick) => renderBrick(brick))}
      </View>
    );
  };

  const renderBrick = (brick: any, index?: number) => {
    const content = brick.content || {};
    const text = content.markdown || content.text || '';
    const mediaTitle = content.title || (brick.kind === 'image' ? 'Imagen' : brick.kind === 'video' ? 'Video' : brick.kind === 'audio' ? 'Audio' : brick.kind === 'bookmark' ? 'Enlace' : 'Archivo');

    switch (brick.kind) {
      case 'h1':
        return <Text key={brick.id} style={styles.h1}>{text}</Text>;
      case 'h2':
        return <Text key={brick.id} style={styles.h2}>{text}</Text>;
      case 'h3':
        return <Text key={brick.id} style={styles.h3}>{text}</Text>;
      
      case 'text':
        return <Text key={brick.id} style={paragraphStyle}>{text}</Text>;
      
      case 'bullet':
        return (
          <View key={brick.id} style={styles.listItem}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={{ flex: 1 }}>{text}</Text>
          </View>
        );
      
      case 'number':
        const itemIndex = typeof index === 'number' ? index : 0;
        return (
          <View key={brick.id} style={styles.listItem}>
            <Text style={styles.listBullet}>{itemIndex + 1}.</Text>
            <Text style={{ flex: 1 }}>{text}</Text>
          </View>
        );
      
      case 'checklist':
        if (content.items && Array.isArray(content.items)) {
          return (
            <View key={brick.id} style={styles.list}>
              {content.items.map((item: any, i: number) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.listBullet}>{item.checked ? '☑' : '☐'}</Text>
                  <Text style={{ flex: 1 }}>{item.label || ''}</Text>
                </View>
              ))}
            </View>
          );
        }
        return null;

      case 'quote':
        return <Text key={brick.id} style={styles.quote}>{text}</Text>;

      case 'divider':
        return <View key={brick.id} style={styles.divider} />;

      case 'callout':
        return (
          <View key={brick.id} style={styles.callout}>
            <Text style={{ fontWeight: 'bold', marginBottom: 6 }}>{content.title || 'Llamado'}</Text>
            {text ? <Text style={{ marginBottom: 4 }}>{text}</Text> : null}
            {renderNestedBricks(content, 'body')}
          </View>
        );

      case 'code':
        return <Text key={brick.id} style={styles.codeBlock}>{text}</Text>;

      case 'math':
        return (
          <View key={brick.id} style={styles.mediaCard}>
            <Text style={styles.mediaTitle}>Fórmula</Text>
            <Text style={{ fontFamily: 'Courier', fontSize: 10 }}>{text}</Text>
          </View>
        );

      case 'media':
      case 'image':
      case 'video':
      case 'audio':
      case 'file':
      case 'bookmark':
        return (
          <View key={brick.id} style={styles.mediaCard}>
            <Text style={styles.mediaTitle}>{mediaTitle}</Text>
            {content.url ? <Text style={{ fontSize: 10, color: '#2563eb' }}>{content.url}</Text> : null}
            {content.caption ? <Text style={styles.mediaCaption}>{content.caption}</Text> : null}
          </View>
        );

      case 'tabs': {
        const tabs = Array.isArray(content.tabs) && content.tabs.length > 0
          ? content.tabs
          : [{ id: '1', label: 'Tab 1' }];

        return (
          <View key={brick.id} style={styles.containerCard}>
            <Text style={styles.containerTitle}>{content.title || 'Tabs'}</Text>
            {tabs.map((tab: any, tabIndex: number) => (
              <View key={tab.id || tabIndex} style={styles.tabSection}>
                <Text style={styles.tabLabel}>{tab.label || `Tab ${tabIndex + 1}`}</Text>
                {tab.content ? <Text style={paragraphStyle}>{tab.content}</Text> : null}
                {renderNestedBricks(content, tab.id)}
              </View>
            ))}
          </View>
        );
      }

      case 'columns': {
        const columns = Array.isArray(content.columns) && content.columns.length > 0
          ? content.columns
          : [{ id: '1' }, { id: '2' }];

        return (
          <View key={brick.id} style={styles.containerCard}>
            <Text style={styles.containerTitle}>{content.title || 'Columnas'}</Text>
            <View style={styles.columnsRow}>
              {columns.map((column: any, columnIndex: number) => {
                const nested = resolveNestedBricks(content, column.id, document.bricks as any[]);
                return (
                  <View key={column.id || columnIndex} style={styles.column}>
                    <Text style={styles.containerLabel}>Columna {columnIndex + 1}</Text>
                    {nested.length > 0 ? nested.map((nestedBrick) => renderBrick(nestedBrick)) : <Text style={styles.paragraphCarta}> </Text>}
                  </View>
                );
              })}
            </View>
          </View>
        );
      }
      
      case 'table':
        return renderTable(brick, content);
      
      case 'bountiful':
        return renderBountifulTable(brick, content);
      
      case 'accordion':
        return (
          <View key={brick.id} style={styles.callout}>
            <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>{content.title || ''}</Text>
            {content.body ? <Text style={{ marginBottom: 6 }}>{content.body}</Text> : null}
            {renderNestedBricks(content, 'body')}
          </View>
        );
      
      case 'ai':
        return (
          <View key={brick.id} style={{ marginBottom: 10, padding: 10, backgroundColor: '#f3f0ff', borderWidth: 1, borderColor: '#6c5ce7', borderStyle: 'solid', borderRadius: 8 }}>
            <Text style={{ fontSize: 10, color: '#6c5ce7', marginBottom: 5 }}>✨ AI Generado</Text>
            <Text>{text}</Text>
          </View>
        );
      
      default:
        if (text) {
          return <Text key={brick.id} style={paragraphStyle}>{text}</Text>;
        }
        return null;
    }
  };

  const renderTable = (brick: any, content: any) => {
    const rows = content.rows || [];
    if (rows.length === 0) return null;

    // Detectar si es bountiful por la presencia de columns
    if (content.columns && Array.isArray(content.columns)) {
      return renderBountifulTable(brick, content);
    }

    // Tabla simple
    return (
      <View key={brick.id} style={styles.table}>
        {rows.map((row: any[], rowIndex: number) => (
          <View key={rowIndex} style={[styles.tableRow, (rowIndex === 0 && styles.tableHeader as any)]}>
            {Array.isArray(row) && row.map((cell: any, cellIndex: number) => (
              <Text key={cellIndex} style={styles.tableCell}>
                {String(cell || '')}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderBountifulTable = (brick: any, content: any) => {
    const rows = content.rows || [];
    const columns = content.columns || [];
    
    if (rows.length === 0) return null;

    return (
      <View key={brick.id} style={styles.table}>
        {/* Header */}
        {columns.length > 0 && (
          <View style={[styles.tableRow, styles.tableHeader]}>
            {columns.map((col: any) => (
              <Text key={col.id} style={styles.tableCell}>
                {col.name || col.label || ''}
              </Text>
            ))}
          </View>
        )}
        
        {/* Rows */}
        {rows.map((row: any, rowIndex: number) => {
          const cells = row.cells || {};
          return (
            <View key={row.id || rowIndex} style={styles.tableRow}>
              {columns.map((col: any) => {
                const cell = cells[col.id];
                const cellText = renderBountifulCellText(cell);
                return (
                  <Text key={col.id} style={styles.tableCell}>
                    {cellText}
                  </Text>
                );
              })}
            </View>
          );
        })}
      </View>
    );
  };

  const renderBountifulCellText = (cell: any): string => {
    if (!cell || typeof cell !== 'object') return '';
    
    const type = cell.type || 'text';
    
    switch (type) {
      case 'text':
        return String(cell.text ?? cell.value ?? '');
      
      case 'number':
        if (cell.number === null || cell.number === undefined) return '';
        return cell.number.toLocaleString('es-ES');
      
      case 'checkbox':
        return cell.checked ? '☑' : '☐';
      
      case 'select':
        return cell.name || '';
      
      case 'multi_select':
        return (cell.items || []).map((i: any) => i.name).join(', ');
      
      case 'date':
        if (!cell.start) return '';
        try {
          const date = new Date(cell.start);
          return date.toLocaleDateString('es-ES');
        } catch {
          return String(cell.start);
        }
      
      case 'url':
        return cell.url || '';
      
      case 'user':
        return (cell.users || []).map((u: any) => u.name || u.email || 'User').join(', ');
      
      case 'document':
        return (cell.documents || []).map((d: any) => d.name || 'Page').join(', ');
      
      case 'board':
        return (cell.boards || []).map((b: any) => b.name || 'Board').join(', ');
      
      case 'card':
        return (cell.cards || []).map((c: any) => c.name || 'Card').join(', ');
      
      default:
        return String(cell.text ?? cell.value ?? '');
    }
  };

  return (
    <Document>
      <Page size={paperSize === 'letter' ? 'LETTER' : 'A4'} style={pageStyle}>
        <Text style={styles.watermark}>KILLIO</Text>

        {/* Export Date */}
        <Text style={styles.exportDate}>
          Documento exportado el: {exportDate}
        </Text>

        {/* Title */}
        <Text style={styles.title}>{document.title}</Text>

        {/* Content */}
        {topLevelBricks.map((brick, index) => renderBrick(brick, index))}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>KILLIO</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

export async function generatePDF(
  document: DocumentView,
  style: 'carta' | 'harvard' = 'carta',
  paperSize: 'letter' | 'A4' = 'A4'
): Promise<Blob> {
  const exportDate = new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const blob = await pdf(
    <PDFDocument document={document} style={style} paperSize={paperSize} exportDate={exportDate} />
  ).toBlob();

  return blob;
}
