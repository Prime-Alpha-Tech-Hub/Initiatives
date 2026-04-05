"""
AutoOps — Operational Automation Platform
Initiative 13 of 15 — Prime Alpha Securities Technology Roadmap
"""
from pathlib import Path
from decouple import config
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY   = config('SECRET_KEY', default='autoops-dev-key-change-in-production')
DEBUG        = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS= config('ALLOWED_HOSTS', default='*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'django_celery_beat',
    'django_celery_results',
    # AutoOps apps
    'apps.core',
    'apps.documents',
    'apps.kyc',
    'apps.compliance',
    'apps.transactions',
    'apps.email_workflows',
    'apps.pipelines',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF      = 'config.urls'
WSGI_APPLICATION  = 'config.wsgi.application'

TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates',
              'DIRS': [], 'APP_DIRS': True,
              'OPTIONS': {'context_processors': [
                  'django.template.context_processors.request',
                  'django.contrib.auth.context_processors.auth',
                  'django.contrib.messages.context_processors.messages',
              ]}}]

# ── Database ──────────────────────────────────────────────────────────────────
DATABASES = {
    'default': dj_database_url.config(
        default=config('DATABASE_URL', default=f'sqlite:///{BASE_DIR}/autoops.sqlite3'),
        conn_max_age=600,
    )
}

# ── REST Framework ────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}

CORS_ALLOWED_ORIGINS = config(
    'CORS_ORIGINS',
    default='http://localhost:5173,http://localhost:3000,http://localhost:8080'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# ── Celery ────────────────────────────────────────────────────────────────────
REDIS_URL              = config('REDIS_URL', default='redis://localhost:6379/0')
CELERY_BROKER_URL      = REDIS_URL
CELERY_RESULT_BACKEND  = 'django-db'            # store results in Django DB
CELERY_CACHE_BACKEND   = 'default'
CELERY_ACCEPT_CONTENT  = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_TIMEZONE        = 'UTC'
CELERY_BEAT_SCHEDULER  = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_TASK_TRACK_STARTED = True

# ── Static / Media ────────────────────────────────────────────────────────────
STATIC_URL   = '/static/'
STATIC_ROOT  = BASE_DIR / 'staticfiles'
MEDIA_URL    = '/media/'
MEDIA_ROOT   = BASE_DIR / 'media'
WHITENOISE_ROOT = BASE_DIR / 'staticfiles' / 'frontend'

DATA_UPLOAD_MAX_MEMORY_SIZE = 52428800

# ── Integrations ──────────────────────────────────────────────────────────────
RESEND_API_KEY     = config('RESEND_API_KEY', default='')
ALPHACORE_API_URL  = config('ALPHACORE_API_URL', default='http://localhost:8080/api')
ALPHACORE_API_KEY  = config('ALPHACORE_API_KEY', default='')

# Sanctions / compliance data sources
OPENSANCTIONS_API_KEY = config('OPENSANCTIONS_API_KEY', default='')

LANGUAGE_CODE      = 'en-us'
TIME_ZONE          = 'UTC'
USE_I18N           = True
USE_TZ             = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Logging — writes to logs/ directory ──────────────────────────────────────
import os as _os
LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} {module}:{lineno} — {message}',
            'style':  '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '[{asctime}] {levelname} — {message}',
            'style':  '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'handlers': {
        'console': {
            'class':     'logging.StreamHandler',
            'formatter': 'simple',
            'level':     'INFO',
        },
        'app_file': {
            'class':       'logging.handlers.RotatingFileHandler',
            'filename':    str(LOGS_DIR / 'app.log'),
            'maxBytes':    5 * 1024 * 1024,  # 5MB per file
            'backupCount': 5,
            'formatter':   'verbose',
            'level':       'DEBUG',
            'encoding':    'utf-8',
        },
        'error_file': {
            'class':       'logging.handlers.RotatingFileHandler',
            'filename':    str(LOGS_DIR / 'errors.log'),
            'maxBytes':    5 * 1024 * 1024,
            'backupCount': 5,
            'formatter':   'verbose',
            'level':       'ERROR',
            'encoding':    'utf-8',
        },
        'celery_file': {
            'class':       'logging.handlers.RotatingFileHandler',
            'filename':    str(LOGS_DIR / 'celery.log'),
            'maxBytes':    5 * 1024 * 1024,
            'backupCount': 3,
            'formatter':   'verbose',
            'level':       'INFO',
            'encoding':    'utf-8',
        },
        'kyc_file': {
            'class':       'logging.handlers.RotatingFileHandler',
            'filename':    str(LOGS_DIR / 'kyc.log'),
            'maxBytes':    5 * 1024 * 1024,
            'backupCount': 3,
            'formatter':   'verbose',
            'level':       'DEBUG',
            'encoding':    'utf-8',
        },
        'requests_file': {
            'class':       'logging.handlers.RotatingFileHandler',
            'filename':    str(LOGS_DIR / 'requests.log'),
            'maxBytes':    5 * 1024 * 1024,
            'backupCount': 3,
            'formatter':   'simple',
            'level':       'INFO',
            'encoding':    'utf-8',
        },
    },
    'loggers': {
        # Root — catches everything not matched below
        '': {
            'handlers': ['console', 'app_file', 'error_file'],
            'level':    'INFO',
            'propagate': False,
        },
        # Django internals
        'django': {
            'handlers': ['console', 'app_file', 'error_file'],
            'level':    'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['requests_file', 'error_file'],
            'level':    'INFO',
            'propagate': False,
        },
        'django.db.backends': {
            'handlers': ['app_file'],
            'level':    'WARNING',  # set to DEBUG to log all SQL queries
            'propagate': False,
        },
        # AutoOps modules
        'apps.documents': {'handlers': ['console', 'app_file', 'error_file'], 'level': 'DEBUG', 'propagate': False},
        'apps.kyc':        {'handlers': ['console', 'kyc_file',  'error_file'], 'level': 'DEBUG', 'propagate': False},
        'apps.compliance': {'handlers': ['console', 'app_file',  'error_file'], 'level': 'DEBUG', 'propagate': False},
        'apps.transactions':{'handlers':['console', 'app_file',  'error_file'], 'level': 'DEBUG', 'propagate': False},
        'apps.email_workflows':{'handlers':['console','app_file','error_file'], 'level': 'DEBUG', 'propagate': False},
        'apps.pipelines':  {'handlers': ['console', 'app_file',  'error_file'], 'level': 'DEBUG', 'propagate': False},
        # Celery
        'celery':          {'handlers': ['console', 'celery_file', 'error_file'], 'level': 'INFO',  'propagate': False},
        'celery.task':     {'handlers': ['celery_file', 'error_file'],            'level': 'INFO',  'propagate': False},
    },
}

# ── URL prefix (namespaced deployment) ───────────────────────────────────────
FORCE_SCRIPT_NAME = config('SCRIPT_NAME', default='/ao')

# ── Integration peers (blank = standalone) ──────────────────────────────────
INTEGRATION_API_KEY = config('INTEGRATION_API_KEY', default='')
ALPHACORE_URL       = config('ALPHACORE_URL', default='')
ALPHACORE_API_KEY   = config('ALPHACORE_API_KEY', default='')
DD_ENGINE_URL       = config('DD_ENGINE_URL', default='')
DD_ENGINE_API_KEY   = config('DD_ENGINE_API_KEY', default='')
