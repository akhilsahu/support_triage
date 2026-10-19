import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, beforeAll } from 'vitest'
import { AssetPickerModal, type ImagePickerTarget } from './AssetPickerModal'
import type { AppearanceAsset } from '../../../api/appearance'

describe('AssetPickerModal', () => {
  afterEach(() => {
    cleanup()
  })

  beforeAll(() => {
    // HTMLDialogElement polyfill for JSDOM
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false
    })
  })

  const sampleAssets: AppearanceAsset[] = [
    {
      id: 'asset-1',
      filename: 'hero-banner.png',
      mimeType: 'image/png',
      byteSize: 102400,
      url: 'https://example.com/hero-banner.png',
      thumbnailUrl: 'https://example.com/hero-banner-thumb.png',
      altText: 'Hero banner preview',
      width: 1200,
      height: 800,
    },
    {
      id: 'asset-2',
      filename: 'portfolio-work.jpg',
      mimeType: 'image/jpeg',
      byteSize: 204800,
      url: 'https://example.com/portfolio-work.jpg',
      thumbnailUrl: 'https://example.com/portfolio-work-thumb.jpg',
      altText: 'Portfolio sample',
      width: 800,
      height: 600,
    },
  ]

  const sampleTarget: ImagePickerTarget = {
    sectionType: 'portfolio',
    itemKey: 'item-1',
    itemTitle: 'Brand Redesign',
    currentImageUrl: 'https://example.com/portfolio-work.jpg',
  }

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <AssetPickerModal
        isOpen={false}
        target={sampleTarget}
        assets={sampleAssets}
        onClose={vi.fn()}
        onSelectAsset={vi.fn()}
        onUploadFile={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders both tabs and defaults to existing assets when assets are available', () => {
    render(
      <AssetPickerModal
        isOpen={true}
        target={sampleTarget}
        assets={sampleAssets}
        onClose={vi.fn()}
        onSelectAsset={vi.fn()}
        onUploadFile={vi.fn()}
      />
    )

    expect(screen.getByText('Upload from system')).toBeInTheDocument()
    expect(screen.getByText(/Choose from existing assets/)).toBeInTheDocument()
    expect(screen.getByText('hero-banner.png')).toBeInTheDocument()
    expect(screen.getByText('portfolio-work.jpg')).toBeInTheDocument()
  })

  it('switches to the Upload from system tab when clicked', () => {
    render(
      <AssetPickerModal
        isOpen={true}
        target={sampleTarget}
        assets={sampleAssets}
        onClose={vi.fn()}
        onSelectAsset={vi.fn()}
        onUploadFile={vi.fn()}
      />
    )

    const uploadTab = screen.getByRole('tab', { name: /Upload from system/i })
    fireEvent.click(uploadTab)

    expect(screen.getByText(/drag and drop your image here/i)).toBeInTheDocument()
  })

  it('calls onSelectAsset with selected asset when clicking Use selected asset', () => {
    const onSelectAsset = vi.fn()
    render(
      <AssetPickerModal
        isOpen={true}
        target={sampleTarget}
        assets={sampleAssets}
        onClose={vi.fn()}
        onSelectAsset={onSelectAsset}
        onUploadFile={vi.fn()}
      />
    )

    // Select the first asset
    const firstAssetCard = screen.getByRole('button', { name: /Select hero-banner.png/i })
    fireEvent.click(firstAssetCard)

    // Click confirm button
    const confirmButton = screen.getByRole('button', { name: /Use selected asset/i })
    fireEvent.click(confirmButton)

    expect(onSelectAsset).toHaveBeenCalledWith(sampleAssets[0])
  })

  it('calls onRemoveImage when clicking Remove image button', () => {
    const onRemoveImage = vi.fn()
    render(
      <AssetPickerModal
        isOpen={true}
        target={sampleTarget}
        assets={sampleAssets}
        onClose={vi.fn()}
        onSelectAsset={vi.fn()}
        onUploadFile={vi.fn()}
        onRemoveImage={onRemoveImage}
      />
    )

    const removeBtn = screen.getByRole('button', { name: /Remove image/i })
    fireEvent.click(removeBtn)

    expect(onRemoveImage).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking Cancel button or close icon', () => {
    const onClose = vi.fn()
    render(
      <AssetPickerModal
        isOpen={true}
        target={sampleTarget}
        assets={sampleAssets}
        onClose={onClose}
        onSelectAsset={vi.fn()}
        onUploadFile={vi.fn()}
      />
    )

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelBtn)
    expect(onClose).toHaveBeenCalled()

    const closeBtn = screen.getByRole('button', { name: /Close image picker/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
