Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path $PSScriptRoot '..\public\assets'
$canvasSize = 256
$padding = 16
$visibleSize = $canvasSize - 2 * $padding

foreach ($pair in @(
  @('opg-light.png', 'opg-splash-light.png'),
  @('opg-logo.png', 'opg-splash-gold.png')
)) {
  $sourcePath = Join-Path $assetDirectory $pair[0]
  $outputPath = Join-Path $assetDirectory $pair[1]
  $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    $left = $source.Width
    $top = $source.Height
    $right = -1
    $bottom = -1

    for ($y = 0; $y -lt $source.Height; $y++) {
      for ($x = 0; $x -lt $source.Width; $x++) {
        if ($source.GetPixel($x, $y).A -le 8) { continue }
        if ($x -lt $left) { $left = $x }
        if ($x -gt $right) { $right = $x }
        if ($y -lt $top) { $top = $y }
        if ($y -gt $bottom) { $bottom = $y }
      }
    }

    if ($right -lt $left -or $bottom -lt $top) {
      throw "No visible pixels found in $sourcePath"
    }

    $bounds = [System.Drawing.Rectangle]::new($left, $top, $right - $left + 1, $bottom - $top + 1)
    $canvas = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $target = [System.Drawing.Rectangle]::new($padding, $padding, $visibleSize, $visibleSize)
        $graphics.DrawImage($source, $target, $bounds.X, $bounds.Y, $bounds.Width, $bounds.Height, [System.Drawing.GraphicsUnit]::Pixel)
      } finally {
        $graphics.Dispose()
      }
      $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $canvas.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}
