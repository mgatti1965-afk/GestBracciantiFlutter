Add-Type -AssemblyName System.Drawing

function Generate-Icon {
    param(
        [int]$Size,
        [string]$Path
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background Squircle
    $radius = [int]($Size * 0.22)
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $brushBg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 8, 28, 21), [System.Drawing.Color]::FromArgb(255, 27, 67, 50), 45)
    
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $gp.AddArc(0, 0, $d, $d, 180, 90)
    $gp.AddArc($Size - $d, 0, $d, $d, 270, 90)
    $gp.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
    $gp.AddArc(0, $Size - $d, $d, $d, 90, 90)
    $gp.CloseFigure()
    
    $g.FillPath($brushBg, $gp)

    # Border
    $penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 82, 183, 136), [float]($Size * 0.015))
    $g.DrawPath($penBorder, $gp)

    # Arc decorative
    $penArc = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 244, 162, 97), [float]($Size * 0.02))
    $penArc.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
    $g.DrawArc($penArc, [float]($Size * 0.2), [float]($Size * 0.2), [float]($Size * 0.6), [float]($Size * 0.6), 20, 140)

    # Logo Text "GB"
    $fontGb = New-Object System.Drawing.Font('Arial', [float]($Size * 0.28), [System.Drawing.FontStyle]::Bold)
    $brushGold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 237, 205))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $rectText = New-Object System.Drawing.RectangleF(0, ($Size * 0.18), $Size, ($Size * 0.35))
    $g.DrawString('GB', $fontGb, $brushGold, $rectText, $sf)

    # Subtitle "BRACCIANTI"
    $fontSub = New-Object System.Drawing.Font('Arial', [float]($Size * 0.072), [System.Drawing.FontStyle]::Bold)
    $brushSub = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 244, 162, 97))
    $rectSub = New-Object System.Drawing.RectangleF(0, ($Size * 0.58), $Size, ($Size * 0.18))
    $g.DrawString('BRACCIANTI', $fontSub, $brushSub, $rectSub, $sf)

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Generate-Icon -Size 192 -Path "apps/web-native/public/icon-192.png"
Generate-Icon -Size 512 -Path "apps/web-native/public/icon-512.png"
Generate-Icon -Size 180 -Path "apps/web-native/public/apple-touch-icon.png"
Write-Host "Icons generated successfully!"
