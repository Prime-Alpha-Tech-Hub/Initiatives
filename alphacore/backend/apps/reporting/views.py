"""
Initiative 08 — Automated Investor Reporting
Builds Citadel-style LP reports from live portfolio data.
Delivers via Resend. Stores HTML for preview and re-send.
"""
from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.contrib.auth.models import User
import requests as _req
from django.conf import settings as _settings
import logging
import datetime

logger = logging.getLogger(__name__)
from .models import ReportRecipient, LPReport, ReportDelivery


# ── Resend helper ─────────────────────────────────────────────────────────────
def _send(to, subject, html, attachments=None):
    api_key = getattr(_settings, 'RESEND_API_KEY', '')
    if not api_key:
        logger.warning('[Resend Reports] RESEND_API_KEY not set')
        return None
    payload = {
        'from':    'aurel.botouli@primealphasecurities.com',
        'to':      [to],
        'subject': subject,
        'html':    html,
    }
    try:
        r = _req.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}',
                     'Content-Type': 'application/json'},
            json=payload, timeout=10,
        )
        data = r.json()
        return data.get('id') if r.ok else None
    except Exception as e:
        logger.error(f'[Resend Reports] {e}')
        return None


# ── Report HTML builder ───────────────────────────────────────────────────────
def _fmt(v, prefix='$'):
    """Format number as currency string."""
    try:
        n = float(v)
        if n >= 1_000_000:
            return f'{prefix}{n/1_000_000:.2f}M'
        if n >= 1_000:
            return f'{prefix}{n/1_000:.1f}K'
        return f'{prefix}{n:,.0f}'
    except Exception:
        return '—'


def _pct(v):
    try:
        return f'{float(v):.1f}%'
    except Exception:
        return '—'


def build_report_html(report, portfolio_data, lang='en'):
    """
    Render a Citadel-style LP report in HTML.
    Designed for inline email delivery and PDF generation.
    """
    now   = datetime.datetime.now()
    period_label = f'{report.period} {report.period_year}'
    firm  = 'Prime Alpha Securities'
    strat_colors = {
        'pe':           '#3b82f6',
        'private_credit': '#10b981',
        'commodities':  '#f59e0b',
        'real_estate':  '#8b5cf6',
    }
    strat_labels = {
        'pe':           'Private Equity',
        'private_credit': 'Private Credit',
        'commodities':  'Commodities',
        'real_estate':  'Real Estate',
    }

    # ── KPI cards ──────────────────────────────────────────────────────────────
    total_aum      = portfolio_data.get('total_current', 0)
    total_invested = portfolio_data.get('total_invested', 0)
    total_gain     = portfolio_data.get('total_gain', 0)
    total_ret_pct  = portfolio_data.get('total_return_pct', 0)
    by_strat       = portfolio_data.get('by_strategy', {})
    positions      = portfolio_data.get('positions', [])

    def kpi_card(label, value, sub='', color='#c9a84c'):
        return f'''
        <td style="width:25%;padding:0 8px">
          <div style="background:#111827;border:1px solid #1e2540;border-top:3px solid {color};
            border-radius:8px;padding:16px 18px;text-align:center">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;
              letter-spacing:.12em;margin-bottom:6px">{label}</div>
            <div style="font-size:22px;font-weight:700;color:{color};
              font-family:Consolas,monospace">{value}</div>
            {f'<div style="font-size:11px;color:#64748b;margin-top:4px">{sub}</div>' if sub else ''}
          </div>
        </td>'''

    kpis = f'''
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        {kpi_card('Portfolio AUM', _fmt(total_aum), f'Invested: {_fmt(total_invested)}')}
        {kpi_card('Total Return', _pct(total_ret_pct), f'Gain: {_fmt(total_gain)}',
                   '#10b981' if float(total_ret_pct or 0) >= 0 else '#ef4444')}
        {kpi_card('Active Positions', str(len([p for p in positions if p.get('is_active')])),
                   'Across all strategies', '#3b82f6')}
        {kpi_card('Strategies', str(len(by_strat)), 'Diversified', '#8b5cf6')}
      </tr>
    </table>'''

    # ── Strategy allocation table ──────────────────────────────────────────────
    strat_rows = ''
    for k, v in by_strat.items():
        pct = (v['current'] / total_aum * 100) if total_aum else 0
        gain = v['current'] - v['invested']
        ret  = (gain / v['invested'] * 100) if v['invested'] else 0
        bar_w = max(4, int(pct))
        strat_rows += f'''
        <tr style="border-bottom:1px solid #1e2540">
          <td style="padding:12px 14px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:10px;height:10px;border-radius:50%;
                background:{strat_colors.get(k,'#64748b')};flex-shrink:0"></div>
              <span style="font-weight:600;font-size:13px">{strat_labels.get(k,k)}</span>
            </div>
          </td>
          <td style="padding:12px 14px;font-family:Consolas,monospace;font-size:13px;
            color:#dde4f5">{_fmt(v['current'])}</td>
          <td style="padding:12px 14px">
            <div style="background:#1e2540;border-radius:3px;height:6px;width:120px">
              <div style="background:{strat_colors.get(k,'#64748b')};height:6px;
                border-radius:3px;width:{bar_w}%"></div>
            </div>
            <span style="font-size:10px;color:#64748b;margin-top:3px;display:block">
              {pct:.1f}% of AUM</span>
          </td>
          <td style="padding:12px 14px;font-family:Consolas,monospace;font-size:13px;
            color:{'#10b981' if ret >= 0 else '#ef4444'}">{'+' if ret >= 0 else ''}{ret:.1f}%</td>
          <td style="padding:12px 14px;font-size:12px;color:#64748b">{v['count']} position(s)</td>
        </tr>'''

    strat_table = f'''
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;color:#c9a84c;text-transform:uppercase;
        letter-spacing:.12em;margin-bottom:10px;padding-bottom:8px;
        border-bottom:1px solid #1e2540">Strategy Allocation</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid #1e2540">
            <th style="padding:8px 14px;text-align:left;font-size:10px;color:#64748b;
              text-transform:uppercase;letter-spacing:.08em">Strategy</th>
            <th style="padding:8px 14px;text-align:left;font-size:10px;color:#64748b;
              text-transform:uppercase;letter-spacing:.08em">Current Value</th>
            <th style="padding:8px 14px;text-align:left;font-size:10px;color:#64748b;
              text-transform:uppercase;letter-spacing:.08em">Allocation</th>
            <th style="padding:8px 14px;text-align:left;font-size:10px;color:#64748b;
              text-transform:uppercase;letter-spacing:.08em">Return</th>
            <th style="padding:8px 14px;text-align:left;font-size:10px;color:#64748b;
              text-transform:uppercase;letter-spacing:.08em">Count</th>
          </tr>
        </thead>
        <tbody>{strat_rows}</tbody>
      </table>
    </div>'''

    # ── Position detail cards ─────────────────────────────────────────────────
    pos_cards = ''
    for p in positions:
        if not p.get('is_active'):
            continue
        strat = p.get('strategy', '')
        col   = strat_colors.get(strat, '#64748b')
        moic  = float(p.get('moic') or 0)
        gain  = float(p.get('current_value', 0)) - float(p.get('entry_value', 0))
        pos_cards += f'''
        <div style="background:#111827;border:1px solid #1e2540;border-left:3px solid {col};
          border-radius:8px;padding:14px 16px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;
            margin-bottom:10px">
            <div>
              <div style="font-weight:700;font-size:14px;color:#dde4f5;margin-bottom:4px">
                {p.get('deal_name','—')}</div>
              <span style="font-size:10px;font-weight:700;text-transform:uppercase;
                letter-spacing:.06em;background:{col}22;color:{col};padding:2px 8px;
                border-radius:4px;border:1px solid {col}44">
                {strat_labels.get(strat,strat)}</span>
            </div>
            <div style="text-align:right">
              <div style="font-family:Consolas,monospace;font-size:18px;font-weight:700;
                color:{col}">{_fmt(p.get('current_value',0))}</div>
              <div style="font-size:11px;color:#64748b">Current NAV</div>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#64748b;width:40%">Entry value</td>
              <td style="padding:4px 0;font-family:Consolas,monospace;font-size:12px">
                {_fmt(p.get('entry_value',0))}</td>
              <td style="padding:4px 0;font-size:12px;color:#64748b;width:20%">MOIC</td>
              <td style="padding:4px 0;font-family:Consolas,monospace;font-size:12px;
                color:{'#10b981' if moic >= 1 else '#ef4444'}">{moic:.2f}x</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#64748b">Unrealised gain</td>
              <td style="padding:4px 0;font-family:Consolas,monospace;font-size:12px;
                color:{'#10b981' if gain >= 0 else '#ef4444'}">
                {('+' if gain >= 0 else '')}{_fmt(abs(gain))}</td>
              <td style="padding:4px 0;font-size:12px;color:#64748b">Entry date</td>
              <td style="padding:4px 0;font-size:12px">{p.get('entry_date','—')}</td>
            </tr>
          </table>
        </div>'''

    positions_section = f'''
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;color:#c9a84c;text-transform:uppercase;
        letter-spacing:.12em;margin-bottom:10px;padding-bottom:8px;
        border-bottom:1px solid #1e2540">Portfolio Holdings</div>
      {pos_cards if pos_cards else '<p style="color:#64748b;font-size:13px">No active positions.</p>'}
    </div>'''

    # ── Disclaimer ────────────────────────────────────────────────────────────
    disclaimer = '''
    <div style="border-top:1px solid #1e2540;padding-top:16px;margin-top:16px">
      <p style="font-size:10px;color:#374151;line-height:1.7">
        This report is prepared by Prime Alpha Securities and is intended solely for
        the named recipient. The information contained herein is confidential and may
        not be reproduced or distributed without prior written consent. Past performance
        is not indicative of future results. All valuations are as at the period end
        date and are subject to change. This document does not constitute investment
        advice or a solicitation to invest.
      </p>
    </div>'''

    # ── Full HTML ─────────────────────────────────────────────────────────────
    html = f'''<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>{firm} — LP Report {period_label}</title>
</head>
<body style="margin:0;padding:0;background:#07090f;font-family:Arial,Helvetica,sans-serif;
  color:#dde4f5;-webkit-font-smoothing:antialiased">

  <!-- Outer wrapper -->
  <div style="max-width:720px;margin:0 auto;background:#07090f">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#07090f 0%,#0d1117 100%);
      border-bottom:3px solid #c9a84c;padding:32px 36px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td>
            <div style="font-size:9px;color:#c9a84c;letter-spacing:.22em;
              text-transform:uppercase;margin-bottom:6px">Confidential</div>
            <div style="font-size:22px;font-weight:700;color:#ffffff;
              letter-spacing:-.3px">{firm}</div>
            <div style="font-size:12px;color:#64748b;margin-top:3px">
              Alternative Investment Fund Manager · African Markets</div>
          </td>
          <td style="text-align:right;vertical-align:top">
            <div style="font-size:9px;color:#64748b;text-transform:uppercase;
              letter-spacing:.12em;margin-bottom:4px">Investor Report</div>
            <div style="font-size:18px;font-weight:700;color:#c9a84c">{period_label}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">
              {report.get_report_type_display() if hasattr(report,'get_report_type_display') else report.report_type}</div>
            <div style="font-size:10px;color:#374151;margin-top:6px">
              Prepared {now.strftime('%d %b %Y')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Body -->
    <div style="padding:28px 36px">

      <!-- KPI boards -->
      {kpis}

      <!-- Allocation table -->
      {strat_table}

      <!-- Holdings -->
      {positions_section}

      <!-- Disclaimer -->
      {disclaimer}

    </div>

    <!-- Footer -->
    <div style="background:#0d1117;border-top:1px solid #1e2540;
      padding:16px 36px;text-align:center">
      <div style="font-size:10px;color:#374151;letter-spacing:.06em">
        <span style="color:#c9a84c;font-weight:700">PRIME ALPHA SECURITIES</span>
        &nbsp;·&nbsp; Alternative Investment Fund Manager
        &nbsp;·&nbsp; African Markets &nbsp;·&nbsp; Confidential
      </div>
    </div>

  </div>
</body>
</html>'''
    return html


# ── Serializers ───────────────────────────────────────────────────────────────
class RecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ReportRecipient
        fields = '__all__'
        read_only_fields = ['added_by', 'added_at']


class DeliverySerializer(serializers.ModelSerializer):
    recipient_name  = serializers.SerializerMethodField()
    recipient_email = serializers.SerializerMethodField()
    class Meta:
        model  = ReportDelivery
        fields = '__all__'
    def get_recipient_name(self, obj):
        return obj.recipient.name
    def get_recipient_email(self, obj):
        return obj.recipient.email


class LPReportSerializer(serializers.ModelSerializer):
    prepared_by_name = serializers.SerializerMethodField()
    deliveries       = DeliverySerializer(many=True, read_only=True)
    class Meta:
        model  = LPReport
        fields = '__all__'
        read_only_fields = ['prepared_by', 'sent_by', 'sent_at',
                            'created_at', 'updated_at',
                            'recipients_count', 'sent_count', 'failed_count']
    def get_prepared_by_name(self, obj):
        return obj.prepared_by.get_full_name() if obj.prepared_by else ''


class LPReportListSerializer(serializers.ModelSerializer):
    prepared_by_name = serializers.SerializerMethodField()
    class Meta:
        model  = LPReport
        fields = ['id', 'title', 'report_type', 'period', 'period_year',
                  'status', 'prepared_by_name', 'sent_at',
                  'recipients_count', 'sent_count', 'failed_count', 'created_at']
    def get_prepared_by_name(self, obj):
        return obj.prepared_by.get_full_name() if obj.prepared_by else ''


# ── Recipient ViewSet ─────────────────────────────────────────────────────────
class RecipientViewSet(viewsets.ModelViewSet):
    serializer_class   = RecipientSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from apps.accounts.views import get_membership
        m = get_membership(self.request.user)
        cid = str(m.company_id) if m else '0'
        return ReportRecipient.objects.filter(company_id=cid, is_active=True)

    def perform_create(self, serializer):
        from apps.accounts.views import get_membership
        m = get_membership(self.request.user)
        cid = str(m.company_id) if m else '0'
        serializer.save(company_id=cid, added_by=self.request.user)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        r = self.get_object()
        r.is_active = False
        r.save()
        return Response({'deactivated': True})


# ── Report ViewSet ─────────────────────────────────────────────────────────────
class LPReportViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        return LPReportListSerializer if self.action == 'list' else LPReportSerializer

    def get_queryset(self):
        from apps.accounts.views import get_membership
        m = get_membership(self.request.user)
        cid = str(m.company_id) if m else '0'
        return LPReport.objects.filter(company_id=cid).prefetch_related('deliveries')

    def perform_create(self, serializer):
        from apps.accounts.views import get_membership
        m = get_membership(self.request.user)
        cid = str(m.company_id) if m else '0'
        serializer.save(company_id=cid, prepared_by=self.request.user)

    # ── Generate / preview ────────────────────────────────────────────────────
    @action(detail=False, methods=['post'])
    def generate(self, request):
        """
        POST /api/reporting/reports/generate/
        Body: { title, report_type, period, period_year,
                include_pe, include_credit, include_commodities, include_re }

        Pulls live portfolio data, builds the report HTML,
        saves as a draft LPReport and returns the HTML for preview.
        """
        from apps.accounts.views import get_membership
        from apps.portfolio.views import PortfolioPositionViewSet
        from apps.portfolio.models import PortfolioPosition
        from apps.portfolio.views import PortfolioPositionSerializer

        m   = get_membership(request.user)
        cid = str(m.company_id) if m else '0'

        # Pull live portfolio data
        positions = PortfolioPosition.objects.filter(
            deal__company_id=cid, is_active=True
        ).select_related('deal')

        pos_data = []
        for p in positions:
            s = p.deal.strategy
            include_map = {
                'pe':           request.data.get('include_pe', True),
                'private_credit': request.data.get('include_credit', True),
                'commodities':  request.data.get('include_commodities', True),
                'real_estate':  request.data.get('include_re', True),
            }
            if not include_map.get(s, True):
                continue
            pos_data.append({
                'deal_name':    p.deal.name,
                'strategy':     s,
                'entry_value':  float(p.entry_value),
                'current_value': float(p.current_value),
                'entry_date':   p.entry_date.strftime('%d %b %Y') if p.entry_date else '—',
                'moic':         p.moic,
                'is_active':    p.is_active,
            })

        total_invested = sum(x['entry_value']  for x in pos_data)
        total_current  = sum(x['current_value'] for x in pos_data)
        total_gain     = total_current - total_invested
        total_ret_pct  = (total_gain / total_invested * 100) if total_invested else 0

        by_strat = {}
        for p in pos_data:
            s = p['strategy']
            if s not in by_strat:
                by_strat[s] = {'count': 0, 'invested': 0.0, 'current': 0.0}
            by_strat[s]['count']    += 1
            by_strat[s]['invested'] += p['entry_value']
            by_strat[s]['current']  += p['current_value']

        portfolio_data = {
            'total_invested': total_invested,
            'total_current':  total_current,
            'total_gain':     total_gain,
            'total_return_pct': total_ret_pct,
            'by_strategy':    by_strat,
            'positions':      pos_data,
        }

        # Create draft report record
        report = LPReport.objects.create(
            company_id          = cid,
            title               = request.data.get('title', f'LP Report {request.data.get("period","")} {request.data.get("period_year","")}'),
            report_type         = request.data.get('report_type', 'quarterly'),
            period              = request.data.get('period', 'Q1'),
            period_year         = int(request.data.get('period_year', timezone.now().year)),
            status              = 'draft',
            include_pe          = request.data.get('include_pe', True),
            include_credit      = request.data.get('include_credit', True),
            include_commodities = request.data.get('include_commodities', True),
            include_re          = request.data.get('include_re', True),
            prepared_by         = request.user,
        )

        html = build_report_html(report, portfolio_data)
        report.html_content = html
        report.status       = 'ready'
        report.save()

        return Response({
            'report':    LPReportSerializer(report).data,
            'html':      html,
            'portfolio': portfolio_data,
        }, status=201)

    # ── Preview ───────────────────────────────────────────────────────────────
    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        """Return the stored HTML for iframe preview."""
        from django.http import HttpResponse
        report = self.get_object()
        if not report.html_content:
            return Response({'error': 'No HTML content — regenerate the report.'}, status=400)
        return HttpResponse(report.html_content, content_type='text/html; charset=utf-8')

    # ── Send ──────────────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """
        POST /api/reporting/reports/{id}/send/
        Body: { recipient_ids: [1,2,3] }  — or omit to send to all active recipients.

        Sends the report HTML via Resend to each recipient.
        Logs each delivery in ReportDelivery.
        """
        report = self.get_object()
        if not report.html_content:
            return Response({'error': 'No content — generate the report first.'}, status=400)

        from apps.accounts.views import get_membership
        m   = get_membership(request.user)
        cid = str(m.company_id) if m else '0'

        rid_list = request.data.get('recipient_ids', [])
        if rid_list:
            recipients = ReportRecipient.objects.filter(
                id__in=rid_list, company_id=cid, is_active=True
            )
        else:
            recipients = ReportRecipient.objects.filter(company_id=cid, is_active=True)

        if not recipients.exists():
            return Response({'error': 'No active recipients found.'}, status=400)

        sent = 0; failed = 0
        for rec in recipients:
            subject = (f'[{report.period} {report.period_year}] '
                       f'Prime Alpha Securities — Investor Report')
            msg_id = _send(rec.email, subject, report.html_content)
            success = bool(msg_id)
            ReportDelivery.objects.create(
                report=report, recipient=rec,
                resend_id=msg_id or '', success=success,
                error='' if success else 'Resend API returned no ID',
            )
            if success: sent += 1
            else:       failed += 1

        report.status           = 'sent' if sent > 0 else 'failed'
        report.sent_at          = timezone.now()
        report.sent_by          = request.user
        report.recipients_count = sent + failed
        report.sent_count       = sent
        report.failed_count     = failed
        report.save()

        return Response({
            'sent':    sent,
            'failed':  failed,
            'status':  report.status,
        })

    # ── Resend to failed ──────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def retry_failed(self, request, pk=None):
        """Retry delivery for failed recipients only."""
        report = self.get_object()
        failed_deliveries = report.deliveries.filter(success=False)
        retried = 0
        for d in failed_deliveries:
            subject = (f'[{report.period} {report.period_year}] '
                       f'Prime Alpha Securities — Investor Report')
            msg_id = _send(d.recipient.email, subject, report.html_content)
            if msg_id:
                d.success   = True
                d.resend_id = msg_id
                d.error     = ''
                d.save()
                retried += 1
        report.sent_count    += retried
        report.failed_count  -= retried
        if report.failed_count == 0:
            report.status = 'sent'
        report.save()
        return Response({'retried': retried})


# ── S3 + PDF helpers ──────────────────────────────────────────────────────────
def _html_to_pdf(html_content):
    """
    Render HTML → PDF bytes using WeasyPrint.
    WeasyPrint is included in the pas-aws-layer Lambda layer.
    Falls back gracefully if not installed in dev.
    Returns bytes or None.
    """
    try:
        from weasyprint import HTML as WH
        return WH(string=html_content).write_pdf()
    except ImportError:
        return None
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f'[WeasyPrint] {e}')
        return None


def _upload_to_s3(pdf_bytes, s3_key, bucket=None):
    """
    Upload PDF bytes to S3.
    Bucket read from settings.REPORTS_S3_BUCKET or env var.
    EC2 IAM role provides credentials — no hardcoded keys.
    Returns the S3 URI string or None on failure.
    """
    try:
        import boto3
        from django.conf import settings as _s
        bucket = bucket or getattr(_s, 'REPORTS_S3_BUCKET', None) \
                        or __import__('os').environ.get('REPORTS_S3_BUCKET', '')
        if not bucket:
            return None
        s3 = boto3.client('s3')
        s3.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=pdf_bytes,
            ContentType='application/pdf',
            ServerSideEncryption='AES256',
        )
        return f's3://{bucket}/{s3_key}'
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f'[S3 upload] {e}')
        return None


# ── Attach export/download actions to LPReportViewSet ─────────────────────────
# We add them as standalone view functions and wire them via urls.py
# to avoid re-opening the class definition.

from rest_framework.decorators import api_view, permission_classes
from rest_framework import permissions as _perms
from django.http import HttpResponse as _HR
import re as _re


@api_view(['POST'])
@permission_classes([_perms.IsAuthenticated])
def export_report_pdf(request, pk):
    """
    POST /api/reporting/reports/{id}/export_pdf/
    1. Renders stored HTML → PDF via WeasyPrint
    2. Uploads PDF to S3 (if REPORTS_S3_BUCKET configured)
    3. Stores s3_key on report record
    4. Returns { s3_key, s3_uri, pdf_available }
    """
    from apps.accounts.views import get_membership
    m   = get_membership(request.user)
    cid = str(m.company_id) if m else '0'

    try:
        report = LPReport.objects.get(pk=pk, company_id=cid)
    except LPReport.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if not report.html_content:
        return Response({'error': 'No HTML content — generate the report first.'}, status=400)

    # Build S3 key
    safe_title = _re.sub(r'[^a-zA-Z0-9_-]', '_', report.title)[:60]
    s3_key = (
        f'reports/{cid}/'
        f'pas_report_{report.period}_{report.period_year}_{safe_title}.pdf'
    )

    pdf_bytes = _html_to_pdf(report.html_content)
    pdf_available = pdf_bytes is not None

    s3_uri = None
    if pdf_available:
        s3_uri = _upload_to_s3(pdf_bytes, s3_key)
        if s3_uri:
            report.s3_key = s3_key
            report.save(update_fields=['s3_key'])

    return Response({
        'pdf_available': pdf_available,
        's3_key':        s3_key if s3_uri else None,
        's3_uri':        s3_uri,
        'weasyprint_installed': pdf_available,
        'note': (
            'PDF generated and uploaded to S3.'
            if s3_uri else
            'WeasyPrint not installed in this environment — '
            'PDF will be available in Lambda production deployment. '
            'Use /download_pdf/ to download HTML-as-PDF via browser print.'
        ),
    })


@api_view(['GET'])
@permission_classes([_perms.IsAuthenticated])
def download_report_pdf(request, pk):
    """
    GET /api/reporting/reports/{id}/download_pdf/
    Streams the PDF to the browser as an attachment (triggers Save As dialog).
    If WeasyPrint not available, streams the HTML instead so the user
    can use browser Print → Save as PDF.
    """
    from apps.accounts.views import get_membership
    m   = get_membership(request.user)
    cid = str(m.company_id) if m else '0'

    try:
        report = LPReport.objects.get(pk=pk, company_id=cid)
    except LPReport.DoesNotExist:
        return _HR(status=404)

    if not report.html_content:
        return _HR('No content.', status=400)

    safe_title = _re.sub(r'[^a-zA-Z0-9_-]', '_', report.title)[:60]
    filename   = f'PAS_Report_{report.period}_{report.period_year}_{safe_title}'

    pdf_bytes = _html_to_pdf(report.html_content)

    if pdf_bytes:
        resp = _HR(pdf_bytes, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="{filename}.pdf"'
        return resp
    else:
        # Fallback: serve HTML with print-ready CSS so browser can save as PDF
        printable_html = report.html_content.replace(
            '</head>',
            '<style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
            '.no-print{display:none!important}}</style>'
            '<script>window.onload=function(){window.print();}</script>'
            '</head>'
        )
        resp = _HR(printable_html, content_type='text/html; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="{filename}.html"'
        return resp
