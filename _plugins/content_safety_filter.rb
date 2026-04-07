require 'cgi'
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

    def safe_markdownify(input)
      site = @context.registers[:site]
      converter = site&.find_converter_instance(Jekyll::Converters::Markdown)
      sanitized = sanitize_rich_text(input)
      return sanitized unless converter

      html = converter.convert(sanitized)
      add_external_link_attrs(html, site)
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

    def add_external_link_attrs(html, site)
      return html unless html&.include?('<a')

      site_host = begin
        site_url = site&.config&.fetch('url', nil)
        site_url && URI.parse(site_url).host
      rescue URI::InvalidURIError
        nil
      end

      html.gsub(/<a\b([^>]*?)href=(['"])([^'"]+)\2([^>]*)>/i) do |match|
        leading_attrs = Regexp.last_match(1)
        href = Regexp.last_match(3)
        trailing_attrs = Regexp.last_match(4)

        next match unless external_http_link?(href, site_host)

        updated = match.dup
        unless leading_attrs.match?(/\btarget\s*=/i) || trailing_attrs.match?(/\btarget\s*=/i)
          updated.sub!('<a', '<a target="_blank"')
        end

        unless leading_attrs.match?(/\brel\s*=/i) || trailing_attrs.match?(/\brel\s*=/i)
          updated.sub!('<a', '<a rel="noopener noreferrer"')
        end

        updated
      end
    end

    def external_http_link?(href, site_host)
      uri = URI.parse(href)
      return false unless %w[http https].include?(uri.scheme)
      return true if site_host.nil? || site_host.empty?

      uri.host != site_host
    rescue URI::InvalidURIError
      false
    end
  end
end

Liquid::Template.register_filter(Jekyll::ContentSafetyFilter)
