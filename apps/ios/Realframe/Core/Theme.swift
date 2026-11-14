import SwiftUI

/// Realframe's palette, taken from the web app's globals.css.
enum Theme {
    static let ground = Color(hex: 0xFFFBF7)      // warm ivory background
    static let card = Color.white
    static let cardBorder = Color(hex: 0xF0EBE6)
    static let ink = Color(hex: 0x1C1917)
    static let muted = Color(hex: 0x78716C)
    static let raspberry = Color(hex: 0xBE185D)   // primary
    static let raspberryTint = Color(hex: 0xFDF2F8)
    static let ember = Color(hex: 0xEA580C)       // build progress
    static let success = Color(hex: 0x059669)

    /// Large titles. Space Grotesk once the font is bundled; SF Pro Rounded until then.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// A small status capsule ("Published", "Draft", ...).
struct StatusPill: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(tint.opacity(0.12), in: .capsule)
            .foregroundStyle(tint)
    }
}
