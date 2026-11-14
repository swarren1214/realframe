import Foundation

/// Values from Config.xcconfig, read through Info.plist.
enum Config {
    static let supabaseURL = url("RFSupabaseURL")
    static let supabaseKey = string("RFSupabaseKey")
    static let apiBaseURL = url("RFAPIBaseURL")
    static let reviewDomain = string("RFReviewDomain")

    /// The public review link for a prototype, e.g. https://checkout-redesign.realframe.app
    static func reviewURL(slug: String) -> URL {
        URL(string: "https://\(slug).\(reviewDomain)")!
    }

    private static func string(_ key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, !value.isEmpty else {
            fatalError("\(key) is missing. Set it in apps/ios/Config/Config.local.xcconfig.")
        }
        return value
    }

    private static func url(_ key: String) -> URL {
        guard let url = URL(string: string(key)) else { fatalError("\(key) is not a valid URL.") }
        return url
    }
}
