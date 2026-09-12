"""
WordPress Data Source Service & Preset — self-contained provider for WordPress REST API v2
including posts, pages, and comments.
"""

from __future__ import annotations

from typing import Any, Dict, List
import structlog

logger = structlog.get_logger(__name__)


def get_wp_tools() -> List[Dict[str, Any]]:
    """
    Returns all pre-configured WordPress REST API tools.
    """
    return [
        {
            "name": "wp_search_posts",
            "display_name": "Search WordPress Posts",
            "description": "Search blog posts and articles by query string on WordPress site.",
            "method": "GET",
            "path": "/wp-json/wp/v2/posts",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Search query or keywords to find relevant blog posts"
                    },
                    "per_page": {
                        "type": "integer",
                        "default": 5,
                        "description": "Maximum number of blog posts to return (1-20)"
                    }
                },
                "required": ["search"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {
                    "search": "{search}",
                    "per_page": "{per_page}"
                },
                "headers": {},
                "body": {}
            },
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "title": "title.rendered",
                "link": "link",
                "snippet": "excerpt.rendered",
                "published_at": "date"
            }
        },
        {
            "name": "wp_get_post_by_id",
            "display_name": "Get WordPress Post by ID",
            "description": "Retrieve full body content of a single WordPress post by its unique ID.",
            "method": "GET",
            "path": "/wp-json/wp/v2/posts/{post_id}",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "post_id": {
                        "type": "string",
                        "description": "The unique numerical ID of the WordPress post"
                    }
                },
                "required": ["post_id"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {},
                "headers": {},
                "body": {}
            },
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "title": "title.rendered",
                "content": "content.rendered",
                "link": "link",
                "author": "author",
                "published_at": "date"
            }
        },
        {
            "name": "wp_search_pages",
            "display_name": "Search WordPress Pages",
            "description": "Search static site pages, documentation, and policy pages on WordPress.",
            "method": "GET",
            "path": "/wp-json/wp/v2/pages",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Search query or keywords to find site pages"
                    }
                },
                "required": ["search"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {
                    "search": "{search}"
                },
                "headers": {},
                "body": {}
            },
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "title": "title.rendered",
                "link": "link",
                "snippet": "excerpt.rendered"
            }
        },
        {
            "name": "wp_get_comments",
            "display_name": "Get WordPress Comments",
            "description": "Retrieve user comments and discussion for a specific WordPress post.",
            "method": "GET",
            "path": "/wp-json/wp/v2/comments",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "post_id": {
                        "type": "string",
                        "description": "The unique numerical ID of the WordPress post"
                    }
                },
                "required": ["post_id"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {
                    "post": "{post_id}"
                },
                "headers": {},
                "body": {}
            },
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "author_name": "author_name",
                "content": "content.rendered",
                "date": "date"
            }
        }
    ]


def get_wp_preset() -> Dict[str, Any]:
    """
    Returns the complete WordPress Blog Data Source preset configuration.
    """
    logger.info("Generating WordPress Blog data source preset")
    tools = get_wp_tools()

    return {
        "id": "wp_blog",
        "slug": "wp_blog",
        "name": "WordPress Blog",
        "category": "CMS & Documentation",
        "description": "Retrieve articles, search blog posts, and access static site pages from any WordPress website.",
        "icon": "wordpress",
        "api_version": "v2",
        "base_url_template": "{site_url}",
        "auth_type": "none",
        "auth_header": "Authorization",
        "required_credentials": [
            {
                "name": "site_url",
                "label": "WordPress Site URL",
                "type": "url",
                "placeholder": "https://myblog.com",
                "required": True,
                "help": "The base URL of your WordPress site (e.g. https://example.com)"
            },
            {
                "name": "api_key",
                "label": "Application Password (Optional)",
                "type": "password",
                "placeholder": "xxxx xxxx xxxx xxxx",
                "required": False,
                "help": "Only required if accessing private posts or restricted endpoints."
            }
        ],
        "default_tool": tools[0],
        "tools": tools
    }
