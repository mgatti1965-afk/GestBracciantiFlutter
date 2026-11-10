import SwiftUI

struct RootView: View {
    private let appData = InMemoryAppData()

    var body: some View {
        let currentYear = appData.current()?.id ?? 0
        let workers = appData.workersForYear(currentYear).count
        let logs = appData.logsForYear(currentYear).count

        VStack(spacing: 12) {
            Text("GestBraccianti iOS Native")
                .font(.title2)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)

            Text("Scaffold MVP pronto: prossimi step annata, braccianti, log.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Text("Seed annata corrente: \(currentYear) • Braccianti: \(workers) • Log: \(logs)")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(24)
    }
}

#Preview {
    RootView()
}
