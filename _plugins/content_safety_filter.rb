require 'cgi'
require 'kramdown'
require 'uri'

module Jekyll
  module ContentSafetyFilter
    PLACEHOLDERS = {
      /<br\s*\/?>/i => '__POOL_SAFE_BR__',
      /<em>/i => '__POOL_SAFE_EM_OPEN__',
      /<\/em>/i => '__POOL_SAFE_EM_CLOSE__',
      /<strong>/i => '__POOL_SAFE_STRONG_OPEN__',
      /<\/strong>/i => '__POOL_SAFE_STRONG_CLOSE__',
      /<i>/i => '__POOL_SAFE_I_OPEN__',
      /<\/i>/i => '__POOL_SAFE_I_CLOSE__',
      /<b>/i => '__POOL_SAFE_B_OPEN__',
      /<\/b>/i => '__POOL_SAFE_B_CLOSE__',
      /<u>/i => '__POOL_SAFE_U_OPEN__',
      /<\/u>/i => '__POOL_SAFE_U_CLOSE__'
    }.freeze

    RESTORED_TAGS = {
      '__POOL_SAFE_BR__' => '<br>',
      '__POOL_SAFE_EM_OPEN__' => '<em>',
      '__POOL_SAFE_EM_CLOSE__' => '</em>',
      '__POOL_SAFE_STRONG_OPEN__' => '<strong>',
      '__POOL_SAFE_STRONG_CLOSE__' => '</strong>',
      '__POOL_SAFE_I_OPEN__' => '<i>',
      '__POOL_SAFE_I_CLOSE__' => '</i>',
      '__POOL_SAFE_B_OPEN__' => '<b>',
      '__POOL_SAFE_B_CLOSE__' => '</b>',
      '__POOL_SAFE_U_OPEN__' => '<u>',
      '__POOL_SAFE_U_CLOSE__' => '</u>'
    }.freeze

    def safe_rich_text(input)
      sanitize_rich_text(input)
    end

    def safe_markdown_source(input)
      sanitize_rich_text(input)
    end

    def safe_markdownify(input, site_url = nil)
      sanitized = sanitize_rich_text(input)
      html = Kramdown::Document.new(sanitized).to_html
      sanitize_markdown_links(html, site_url)
    end

    def sanitize_markdown_links(html, site_url = nil)
      sanitize_rendered_markdown_links(html, site_url)
    end

    def approved_embed_src(input, provider)
      src = input.to_s.strip
      return '' if src.empty?

      uri = parse_uri(src)
      return '' unless uri
      return '' unless uri.scheme == 'https'

      case provider.to_s.downcase
      when 'spotify'
        return src if uri.host == 'open.spotify.com' && uri.path.start_with?('/embed/')
      when 'youtube'
        return src if (uri.host == 'www.youtube.com' || uri.host == 'www.youtube-nocookie.com') &&
          uri.path.start_with?('/embed/')
      when 'vimeo'
        return src if uri.host == 'player.vimeo.com' && uri.path.start_with?('/video/')
      end

      ''
    end

    private

    def sanitize_rich_text(input)
      text = input.to_s.dup

      PLACEHOLDERS.each do |pattern, token|
        text.gsub!(pattern, token)
      end

      text = CGI.escapeHTML(text)

      RESTORED_TAGS.each do |token, html|
        text.gsub!(token, html)
      end

      text
    end

    def sanitize_rendered_markdown_links(html, site_url = nil)
      return html unless html&.include?('<a')

      site_host = begin
        site_url && URI.parse(site_url).host
      rescue URI::InvalidURIError
        nil
      end

      html.gsub(/<a\b([^>]*?)href=(['"])([^'"]+)\2([^>]*)>/i) do |match|
        leading_attrs = Regexp.last_match(1)
        href = Regexp.last_match(3)
        trailing_attrs = Regexp.last_match(4)

        updated = match.dup

        unless allowed_link_href?(href)
          updated.sub!(/href=(['"])([^'"]+)\1/i, 'href="#"')
          updated.gsub!(/\s+target=(['"])[^'"]*\1/i, '')
          updated.gsub!(/\s+rel=(['"])[^'"]*\1/i, '')
          next updated
        end

        if external_http_link?(href, site_host)
          unless leading_attrs.match?(/\btarget\s*=/i) || trailing_attrs.match?(/\btarget\s*=/i)
            updated.sub!('<a', '<a target="_blank"')
          end

          unless leading_attrs.match?(/\brel\s*=/i) || trailing_attrs.match?(/\brel\s*=/i)
            updated.sub!('<a', '<a rel="noopener noreferrer"')
          end
        end

        updated
      end
    end

    def allowed_link_href?(href)
      return false if href.nil?

      normalized = CGI.unescapeHTML(href.to_s).strip
      return false if normalized.empty?
      return true if normalized.start_with?('#', '/', '?', './', '../')

      uri = parse_uri(normalized)
      return false unless uri
      return true if uri.scheme.nil? && uri.host.nil?

      %w[http https mailto].include?(uri.scheme)
    end

    def external_http_link?(href, site_host)
      uri = parse_uri(href)
      return false unless uri
      return false unless %w[http https].include?(uri.scheme)
      return true if site_host.nil? || site_host.empty?

      uri.host != site_host
    end

    def parse_uri(value)
      normalized = CGI.unescapeHTML(value.to_s).gsub(/[\u0000-\u0020]+/, '')
      URI.parse(normalized)
    rescue URI::InvalidURIError
      nil
    end
  end
end

Liquid::Template.register_filter(Jekyll::ContentSafetyFilter)
