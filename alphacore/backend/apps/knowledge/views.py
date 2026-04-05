"""
Initiative 10 — Internal Knowledge Base
Views: collections, articles, search, versioning, comments
"""
from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from django.utils import timezone
from .models import KBCollection, Article, ArticleVersion, ArticleComment


# ── helpers ───────────────────────────────────────────────────────────────────
def _company_id(request):
    from apps.accounts.views import get_membership
    m = get_membership(request.user)
    return str(m.company_id) if m else '0'


def _snapshot(article, user, note=''):
    last = article.versions.order_by('-version_num').first()
    num  = (last.version_num + 1) if last else 1
    ArticleVersion.objects.create(
        article=article, version_num=num,
        title=article.title, content=article.content,
        changed_by=user, change_note=note,
    )


# ── Serializers ───────────────────────────────────────────────────────────────
class CollectionSerializer(serializers.ModelSerializer):
    article_count = serializers.SerializerMethodField()

    class Meta:
        model  = KBCollection
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'company_id']

    def get_article_count(self, obj):
        return obj.articles.filter(is_draft=False).count()


class ArticleVersionSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = ArticleVersion
        fields = ['id', 'version_num', 'title', 'changed_by_name',
                  'change_note', 'created_at']

    def get_changed_by_name(self, obj):
        return obj.changed_by.get_full_name() or obj.changed_by.username \
               if obj.changed_by else ''


class CommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model  = ArticleComment
        fields = '__all__'
        read_only_fields = ['author', 'created_at', 'article']

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username \
               if obj.author else ''


class ArticleListSerializer(serializers.ModelSerializer):
    author_name     = serializers.SerializerMethodField()
    collection_name = serializers.SerializerMethodField()
    comment_count   = serializers.SerializerMethodField()
    version_count   = serializers.SerializerMethodField()

    class Meta:
        model  = Article
        fields = ['id', 'title', 'summary', 'category', 'language', 'tags',
                  'collection', 'collection_name', 'is_pinned', 'is_draft',
                  'view_count', 'author_name', 'comment_count', 'version_count',
                  'linked_deal_name', 'created_at', 'updated_at']

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username \
               if obj.author else ''

    def get_collection_name(self, obj):
        return obj.collection.name if obj.collection else None

    def get_comment_count(self, obj):
        return obj.comments.count()

    def get_version_count(self, obj):
        return obj.versions.count()


class ArticleDetailSerializer(ArticleListSerializer):
    versions = ArticleVersionSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)

    class Meta(ArticleListSerializer.Meta):
        fields = ArticleListSerializer.Meta.fields + [
            'content', 'versions', 'comments',
            'linked_deal_id', 'linked_doc_id', 'last_edited_by',
        ]


# ── Collection ViewSet ────────────────────────────────────────────────────────
class CollectionViewSet(viewsets.ModelViewSet):
    serializer_class   = CollectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        cid = _company_id(self.request)
        return KBCollection.objects.filter(company_id=cid).prefetch_related('articles')

    def perform_create(self, serializer):
        cid = _company_id(self.request)
        serializer.save(company_id=cid, created_by=self.request.user)


# ── Article ViewSet ───────────────────────────────────────────────────────────
class ArticleViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('list', 'search', 'pinned', 'recent'):
            return ArticleListSerializer
        return ArticleDetailSerializer

    def get_queryset(self):
        cid = _company_id(self.request)
        qs  = Article.objects.filter(company_id=cid)\
                     .select_related('author', 'collection')\
                     .prefetch_related('versions', 'comments')
        # Filter params
        cat  = self.request.query_params.get('category')
        coll = self.request.query_params.get('collection')
        lang = self.request.query_params.get('language')
        draft= self.request.query_params.get('drafts')
        if cat:   qs = qs.filter(category=cat)
        if coll:  qs = qs.filter(collection_id=coll)
        if lang:  qs = qs.filter(language=lang)
        if not draft or draft != '1':
            qs = qs.filter(is_draft=False)
        return qs

    def perform_create(self, serializer):
        cid = _company_id(self.request)
        article = serializer.save(
            company_id=cid, author=self.request.user
        )
        # Auto-generate summary if not provided
        if not article.summary and article.content:
            words = article.content.replace('\n', ' ').split()
            article.summary = ' '.join(words[:40]) + ('…' if len(words) > 40 else '')
            article.save(update_fields=['summary'])
        _snapshot(article, self.request.user, 'Article created')

    def perform_update(self, serializer):
        note = self.request.data.get('change_note', 'Edited')
        article = serializer.save(last_edited_by=self.request.user)
        if not article.summary and article.content:
            words = article.content.replace('\n', ' ').split()
            article.summary = ' '.join(words[:40]) + ('…' if len(words) > 40 else '')
            article.save(update_fields=['summary'])
        _snapshot(article, self.request.user, note)

    # ── Search ────────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        GET /api/knowledge/articles/search/?q=ohada&category=legal
        Full-text search across title, content, tags, summary.
        """
        q   = request.query_params.get('q', '').strip()
        cid = _company_id(request)
        qs  = Article.objects.filter(company_id=cid, is_draft=False)\
                     .select_related('author', 'collection')
        if q:
            qs = qs.filter(
                Q(title__icontains=q) |
                Q(content__icontains=q) |
                Q(summary__icontains=q) |
                Q(tags__icontains=q) |
                Q(linked_deal_name__icontains=q)
            )
        return Response(ArticleListSerializer(qs[:40], many=True).data)

    # ── Pinned ────────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'])
    def pinned(self, request):
        cid = _company_id(request)
        qs  = Article.objects.filter(
            company_id=cid, is_pinned=True, is_draft=False
        ).select_related('author', 'collection')
        return Response(ArticleListSerializer(qs, many=True).data)

    # ── Recent ────────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'])
    def recent(self, request):
        cid   = _company_id(request)
        limit = int(request.query_params.get('limit', 10))
        qs    = Article.objects.filter(
            company_id=cid, is_draft=False
        ).select_related('author', 'collection').order_by('-updated_at')[:limit]
        return Response(ArticleListSerializer(qs, many=True).data)

    # ── Toggle pin ────────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def toggle_pin(self, request, pk=None):
        article = self.get_object()
        article.is_pinned = not article.is_pinned
        article.save(update_fields=['is_pinned'])
        return Response({'is_pinned': article.is_pinned})

    # ── Record view ───────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def view(self, request, pk=None):
        article = self.get_object()
        Article.objects.filter(pk=article.pk).update(
            view_count=article.view_count + 1
        )
        return Response({'view_count': article.view_count + 1})

    # ── Add comment ───────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def add_comment(self, request, pk=None):
        article = self.get_object()
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Comment content is required.'}, status=400)
        comment = ArticleComment.objects.create(
            article=article, author=request.user, content=content
        )
        return Response(CommentSerializer(comment).data, status=201)

    # ── Version restore ───────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def restore_version(self, request, pk=None):
        """
        POST { version_num: 3 }
        Restores article content to a previous version.
        Creates a new version snapshot of the restore.
        """
        article = self.get_object()
        vnum    = request.data.get('version_num')
        try:
            version = article.versions.get(version_num=vnum)
        except ArticleVersion.DoesNotExist:
            return Response({'error': 'Version not found.'}, status=404)
        article.title   = version.title
        article.content = version.content
        article.last_edited_by = request.user
        article.save()
        _snapshot(article, request.user, f'Restored to v{vnum}')
        return Response(ArticleDetailSerializer(article).data)
